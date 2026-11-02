import { EmptyState } from "@/components/EmptyState";
import { ProductGrid } from "@/components/ProductGrid";
import { requireUserId } from "@/lib/api/session";
import { getWishlist } from "@/services/wishlist.service";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Wishlist" };

/** Wishlist page.*/
export default async function WishlistPage() {
    const products = await getWishlist(await requireUserId());
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Your wishlist</h1>
            {products.length === 0 ? (
                <EmptyState
                    title="No saved items yet"
                    message="Tap the heart on any product to save it for later."
                    actionHref="/products"
                    actionLabel="Browse products"
                />
            ) : (
                <ProductGrid
                    products={products}
                    wishlistIds={new Set(products.map((p) => p.id))}
                    signedIn
                />
            )}
        </div>
    );
}
