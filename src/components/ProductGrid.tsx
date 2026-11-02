import { EmptyState } from "@/components/EmptyState";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/types";

interface Props {
    products: Product[];
    wishlistIds: Set<string>;
    signedIn: boolean;
    emptyTitle?: string;
    emptyMessage?: string;
}

/** Grid with built-in empty state. */
export function ProductGrid({
    products,
    wishlistIds,
    signedIn,
    emptyTitle = "Nothing here yet",
    emptyMessage = "Try a different search or browse every product.",
}: Props) {
    if (products.length === 0) {
        return (
            <EmptyState
                title={emptyTitle}
                message={emptyMessage}
                actionHref="/products"
                actionLabel="Browse all products"
            />
        );
    }
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
                <ProductCard
                    key={p.id}
                    product={p}
                    wishlisted={wishlistIds.has(p.id)}
                    signedIn={signedIn}
                />
            ))}
        </div>
    );
}

/** Skeleton placeholders shown while products load (used by loading.tsx and <Suspense>). */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            aria-busy="true"
            aria-label="Loading products"
        >
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    className="animate-pulse overflow-hidden rounded-lg border border-line bg-surface"
                >
                    <div className="aspect-square bg-line/60" />
                    <div className="space-y-2 p-3">
                        <div className="h-3 w-3/4 rounded bg-line/60" />
                        <div className="h-3 w-1/3 rounded bg-line/60" />
                    </div>
                </div>
            ))}
        </div>
    );
}
