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
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Product listing with search, category/price filters, sorting and "load more" pagination.
 * Data flow: URL params -> zod parse (invalid values fall back to defaults) -> product service.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, first(v)]));
  const parsed = productQuerySchema.safeParse(raw);
  const q = parsed.success ? parsed.data : { sort: "newest" as const, limit: PAGE_SIZE };

  const userId = await getUserId();
  const [page, categories, wishlistIds] = await Promise.all([
    searchProducts({
      search: q.q || undefined,
      categorySlug: "category" in q ? q.category : undefined,
      minPriceCents: "min" in q && q.min !== undefined ? Math.round(q.min * 100) : undefined,
      maxPriceCents: "max" in q && q.max !== undefined ? Math.round(q.max * 100) : undefined,
      sort: q.sort,
      limit: q.limit,
      cursor: "cursor" in q ? q.cursor : undefined,
    }),
    getCategories(),
    userId ? getWishlistIds(userId) : Promise.resolve(new Set<string>()),
  ]);

  // Link to the next page by re-using the current filters and swapping only the cursor.
  const next = new URLSearchParams(Object.entries(raw).filter(([, v]) => v) as [string, string][]);
  if (page.nextCursor) next.set("cursor", page.nextCursor);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Shop</h1>
      <ProductFilters categories={categories} values={{ q: q.q, category: "category" in q ? q.category : undefined, min: "min" in q ? q.min : undefined, max: "max" in q ? q.max : undefined, sort: q.sort }} />
      <ProductGrid products={page.items} wishlistIds={wishlistIds} signedIn={Boolean(userId)} />
      {page.nextCursor && <div className="text-center"><Link href={`/products?${next.toString()}`} className="btn-secondary">Next page</Link></div>}
    </div>
  );
}
