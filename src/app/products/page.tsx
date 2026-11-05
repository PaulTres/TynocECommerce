
import Link from "next/link";
import type { Metadata } from "next";
import { ProductFilters } from "@/components/ProductFilters";
import { ProductGrid } from "@/components/ProductGrid";
import { getUserId } from "@/lib/api/session";
import { PAGE_SIZE } from "@/lib/constants";
import { productQuerySchema } from "@/lib/validation/schemas";
import { getCategories, searchProducts } from "@/services/product.service";
import { getWishlistIds } from "@/services/wishlist.service";

export const metadata: Metadata = { title: "Shop" };

type SearchParams = Record<string, string | string[] | undefined>;

/** Next gives repeated params as arrays; we only support the first value of each. */
const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

/**
 * Creates a pagination URL while preserving the current filters and sorting.
 * Only the pagination cursor changes between navigation requests.
 */
function getPaginationUrl(
    raw: SearchParams,
    cursorName: "nextCursor" | "prevCursor",
    cursor?: string,
): string | undefined {
    if (!cursor) return undefined;

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(raw)) {
        const normalized = first(value);

        // Exclude existing pagination cursors and empty values.
        if (
            key !== "nextCursor" &&
            key !== "prevCursor" &&
            normalized !== undefined &&
            normalized !== ""
        ) {
            params.set(key, normalized);
        }
    }

    params.set(cursorName, cursor);

    return `/products?${params.toString()}`;
}

/**
 * Product listing with search, category/price filters, sorting
 * and bidirectional cursor-based pagination.
 */
export default async function ProductsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const raw = Object.fromEntries(
        Object.entries(await searchParams).map(([key, value]) => [
            key,
            first(value),
        ]),
    );

    const parsed = productQuerySchema.safeParse(raw);
    const q = parsed.success
        ? parsed.data
        : { sort: "newest" as const, limit: PAGE_SIZE };

    const userId = await getUserId();

    const [page, categories, wishlistIds] = await Promise.all([
        searchProducts({
            search: q.q || undefined,
            categorySlug: "category" in q ? q.category : undefined,
            minPriceCents:
                "min" in q && q.min !== undefined
                    ? Math.round(q.min * 100)
                    : undefined,
            maxPriceCents:
                "max" in q && q.max !== undefined
                    ? Math.round(q.max * 100)
                    : undefined,
            sort: q.sort,
            limit: q.limit,
            nextCursor: "nextCursor" in q ? q.nextCursor : undefined,
            prevCursor: "prevCursor" in q ? q.prevCursor : undefined,
        }),
        getCategories(),
        userId ? getWishlistIds(userId) : Promise.resolve(new Set<string>()),
    ]);

    // Generate navigation URLs while preserving all active filters.
    const previousUrl = getPaginationUrl(raw, "prevCursor", page.prevCursor);
    const nextUrl = getPaginationUrl(raw, "nextCursor", page.nextCursor);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Shop</h1>

            <ProductFilters
                categories={categories}
                values={{
                    q: q.q,
                    category: "category" in q ? q.category : undefined,
                    min: "min" in q ? q.min : undefined,
                    max: "max" in q ? q.max : undefined,
                    sort: q.sort,
                }}
            />

            <ProductGrid
                products={page.items}
                wishlistIds={wishlistIds}
                signedIn={Boolean(userId)}
            />

            {/* Bidirectional pagination controls. */}
            {(previousUrl || nextUrl) && (
                <nav
                    aria-label="Product pagination"
                    className="flex items-center justify-between"
                >
                    {previousUrl ? (
                        <Link href={previousUrl} className="btn-secondary">
                            Previous page
                        </Link>
                    ) : (
                        <span />
                    )}

                    {nextUrl && (
                        <Link href={nextUrl} className="btn-secondary">
                            Next page
                        </Link>
                    )}
                </nav>
            )}
        </div>
    );
}
