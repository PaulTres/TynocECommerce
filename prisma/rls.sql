-- Apply after `pnpm db:push` with the Neon owner/direct URL.
-- Enable the Neon Data API for this branch and select Managed Better Auth.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'Enable the Neon Data API for this branch before applying this script';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname IN ('anonymous', 'authenticated') AND rolbypassrls
    ) THEN
        RAISE EXCEPTION 'Neon Data API roles must not have BYPASSRLS';
    END IF;
END
$$;

-- The old table held credentials owned by the application. Keep the internal
-- ids (and cart/wishlist foreign keys), but remove all identity data.
ALTER TABLE public."User"
    ADD COLUMN IF NOT EXISTS "authUserId" TEXT;
ALTER TABLE public."User"
    DROP COLUMN IF EXISTS "email",
    DROP COLUMN IF EXISTS "name",
    DROP COLUMN IF EXISTS "passwordHash";
CREATE UNIQUE INDEX IF NOT EXISTS "User_authUserId_key"
    ON public."User" ("authUserId");

-- Public catalogue reads are intentional. No client role can modify the catalogue.
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_public_read" ON public."Category";
CREATE POLICY "category_public_read" ON public."Category"
    FOR SELECT TO anonymous, authenticated USING (true);
DROP POLICY IF EXISTS "product_public_read" ON public."Product";
CREATE POLICY "product_public_read" ON public."Product"
    FOR SELECT TO anonymous, authenticated USING (true);

-- One app profile row per authenticated Neon Auth subject. The primary key remains
-- a separate random UUID and only the matching subject can select/insert it.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_select_self" ON public."User";
CREATE POLICY "user_select_self" ON public."User"
    FOR SELECT TO authenticated
    USING ("authUserId" = (SELECT auth.user_id()));
DROP POLICY IF EXISTS "user_insert_self" ON public."User";
CREATE POLICY "user_insert_self" ON public."User"
    FOR INSERT TO authenticated
    WITH CHECK ("authUserId" = (SELECT auth.user_id()));

-- Cart rows are visible and writable only when their opaque app user id maps
-- to the subject in this request's Neon Auth JWT.
ALTER TABLE public."CartItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cart_select_self" ON public."CartItem";
CREATE POLICY "cart_select_self" ON public."CartItem"
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "CartItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));
DROP POLICY IF EXISTS "cart_insert_self" ON public."CartItem";
CREATE POLICY "cart_insert_self" ON public."CartItem"
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "CartItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));
DROP POLICY IF EXISTS "cart_update_self" ON public."CartItem";
CREATE POLICY "cart_update_self" ON public."CartItem"
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "CartItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "CartItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));
DROP POLICY IF EXISTS "cart_delete_self" ON public."CartItem";
CREATE POLICY "cart_delete_self" ON public."CartItem"
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "CartItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));

ALTER TABLE public."WishlistItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wishlist_select_self" ON public."WishlistItem";
CREATE POLICY "wishlist_select_self" ON public."WishlistItem"
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "WishlistItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));
DROP POLICY IF EXISTS "wishlist_insert_self" ON public."WishlistItem";
CREATE POLICY "wishlist_insert_self" ON public."WishlistItem"
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "WishlistItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));
DROP POLICY IF EXISTS "wishlist_delete_self" ON public."WishlistItem";
CREATE POLICY "wishlist_delete_self" ON public."WishlistItem"
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public."User" AS u
        WHERE u."id" = "WishlistItem"."userId"
          AND u."authUserId" = (SELECT auth.user_id())
    ));

-- Give runtime roles access only to the application tables listed below.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
    FROM PUBLIC, anonymous, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
    FROM PUBLIC, anonymous, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, anonymous, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anonymous, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anonymous, authenticated;
GRANT SELECT ON TABLE public."Category", public."Product" TO anonymous, authenticated;
GRANT SELECT, INSERT ON TABLE public."User" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."CartItem" TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public."WishlistItem" TO authenticated;

-- Keep the quantity cap atomic when concurrent Data API requests add the same
-- product. This is SECURITY INVOKER so the caller's RLS policies still apply.
CREATE OR REPLACE FUNCTION public.increment_cart_item(
    p_user_id TEXT,
    p_product_id TEXT,
    p_qty INTEGER,
    p_cap INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_quantity INTEGER;
BEGIN
    IF p_qty < 1 OR p_cap < 1 OR p_qty > p_cap THEN
        RETURN NULL;
    END IF;

    INSERT INTO public."CartItem" AS current_item
        ("userId", "productId", "quantity", "updatedAt")
    VALUES
        (p_user_id, p_product_id, p_qty, pg_catalog.now())
    ON CONFLICT ("userId", "productId") DO UPDATE
        SET "quantity" = current_item."quantity" + EXCLUDED."quantity",
            "updatedAt" = pg_catalog.now()
        WHERE current_item."quantity" <= p_cap - p_qty
    RETURNING current_item."quantity" INTO v_quantity;

    RETURN v_quantity;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.increment_cart_item(TEXT, TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cart_item(TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated;

COMMIT;
