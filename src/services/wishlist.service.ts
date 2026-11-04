import * as productsRepo from "@/lib/db/products.repo";
import * as wishlistRepo from "@/lib/db/wishlist.repo";
import { NotFoundError } from "@/lib/errors";
import type { Product } from "@/types";

/** Returns the wishlisted products newest first, skipping products that no longer exist. */
export async function getWishlist(userId: string): Promise<Product[]> {
    const rows = await wishlistRepo.listWishlist(userId);
    const products = await productsRepo.batchGetProducts(
        rows.map((r) => r.productId),
    );
    const byId = new Map(products.map((p) => [p.id, p]));
    return rows
        .map((r) => byId.get(r.productId))
        .filter((p): p is Product => Boolean(p));
}

/** Set of wishlisted product ids - lets list/detail pages render the filled-heart state cheaply. */
export async function getWishlistIds(userId: string): Promise<Set<string>> {
    return new Set(
        (await wishlistRepo.listWishlist(userId)).map((r) => r.productId),
    );
}

export async function getWishlistCount(userId: string): Promise<number> {
    return await wishlistRepo.wishlistCount(userId);
}

/**
 * Adds a product (idempotent - duplicates are prevented by conditional write).
 * @returns whether it was newly added.
 * @throws NotFoundError for unknown products.
 */
export async function addToWishlist(
    userId: string,
    productId: string,
): Promise<boolean> {
    if (!(await productsRepo.getProduct(productId)))
        throw new NotFoundError("Product not found");
    return wishlistRepo.addWishlistItem(userId, productId);
}

/** Removes a product from the wishlist. */
export async function removeFromWishlist(
    userId: string,
    productId: string,
): Promise<void> {
    await wishlistRepo.removeWishlistItem(userId, productId);
}
