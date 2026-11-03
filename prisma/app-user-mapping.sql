-- Run after `pnpm run db:rls` with the Neon owner/direct URL.
-- Use the authenticated request JWT as the single source of identity when
-- creating or returning the app-user mapping.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_or_create_app_user()
RETURNS TABLE(id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_jwt_user_id TEXT;
BEGIN
    v_jwt_user_id := auth.user_id()::text;
    IF v_jwt_user_id IS NULL THEN
        RAISE EXCEPTION 'An authenticated Neon Auth Data API token is required';
    END IF;

    INSERT INTO public."User" ("id", "authUserId")
    VALUES (pg_catalog.gen_random_uuid()::text, v_jwt_user_id)
    ON CONFLICT ("authUserId") DO NOTHING;

    RETURN QUERY
        SELECT u."id"
        FROM public."User" AS u
        WHERE u."authUserId" = v_jwt_user_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_or_create_app_user(TEXT);

REVOKE ALL ON FUNCTION public.get_or_create_app_user()
    FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_app_user()
    TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
