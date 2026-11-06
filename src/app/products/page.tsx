import { ProductFilters } from "@/components/ProductFilters";
import { ProductGrid } from "@/components/ProductGrid";
import { getUserId } from "@/lib/api/session";
import { first, getPaginationUrl } from "@/lib/utils";
import { productQuerySchema } from "@/lib/validation/schemas";
import { getCategories, searchProducts } from "@/services/product.service";
import { getWishlistIds } from "@/services/wishlist.service";
import { SearchParams } from "@/types";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Shop" };

/**
 * Product listing with search, category/price filters, sorting
 * and bidirectional cursor-based pagination.
 */
export default async function ProductsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const raw: Record<string, string | undefined> = Object.fromEntries(
        Object.entries(await searchParams).map(([key, value]) => [
            key,
            first(value),
        ]),
    );

    const parsed = productQuerySchema.safeParse(raw);
    const q = parsed.success ? parsed.data : undefined;
    const validationErrors = parsed.success
        ? []
        : [...new Set(parsed.error.issues.map((issue) => issue.message))];

    const userId = await getUserId();

    // Invalid filters are shown in the form and never sent to the product query.
    const pagePromise = q
        ? searchProducts({
              search: q.q || undefined,
              categorySlug: q.category,
              minPriceCents:
                  q.min !== undefined ? Math.round(q.min * 100) : undefined,
              maxPriceCents:
                  q.max !== undefined ? Math.round(q.max * 100) : undefined,
              sort: q.sort,
              limit: q.limit,
              nextCursor: q.nextCursor,
              prevCursor: q.prevCursor,
          })
        : Promise.resolve(undefined);

    const filterValues = q
        ? {
              q: q.q,
              category: q.category,
              min: q.min,
              max: q.max,
              sort: q.sort,
          }
        : {
              q: raw.q,
              category: raw.category,
              min: raw.min,
              max: raw.max,
              sort: raw.sort ?? "newest",
          };

    const [page, categories, wishlistIds] = await Promise.all([
        pagePromise,
        getCategories(),
        q && userId
            ? getWishlistIds(userId)
            : Promise.resolve(new Set<string>()),
    ]);

    // Build pagination links only from the validated query that produced this page.
    const previousUrl =
        q && page
            ? getPaginationUrl(q, "prevCursor", page.prevCursor)
            : undefined;
    const nextUrl =
        q && page
            ? getPaginationUrl(q, "nextCursor", page.nextCursor)
            : undefined;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Shop</h1>

            <ProductFilters
                categories={categories}
                values={filterValues}
                validationErrors={validationErrors}
            />

            {page ? (
                <ProductGrid
                    products={page.items}
                    wishlistIds={wishlistIds}
                    signedIn={Boolean(userId)}
                />
            ) : (
                <p className="text-sm text-slate" role="status">
                    Correct the invalid values and apply the filters again.
                </p>
            )}

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
