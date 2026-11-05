import { withErrors } from "@/lib/api/handler";
import { productQuerySchema } from "@/lib/validation/schemas";
import { searchProducts } from "@/services/product.service";
import { NextResponse } from "next/server";

/**
 * GET /api/products?q=&category=&min=&max=&sort=&limit=&cursor=
 * Public, cacheable list endpoint. `min`/`max` arrive in dollars and are converted to cents.
 * Responds { items, nextCursor }.
 */
export const GET = withErrors(async (req: Request) => {
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const q = productQuerySchema.parse(params);
    const page = await searchProducts({
        search: q.q || undefined,
        categorySlug: q.category,
        minPriceCents:
            q.min !== undefined ? Math.round(q.min * 100) : undefined,
        maxPriceCents:
            q.max !== undefined ? Math.round(q.max * 100) : undefined,
        sort: q.sort,
        limit: q.limit,
        nextCursor: q.nextCursor,
    });
    return NextResponse.json(page, {
        headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
    });
});
