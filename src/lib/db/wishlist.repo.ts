import type { WishlistItemRecord } from "@/types";
import { db } from "./client";

export async function listWishlist(userId: string): Promise<WishlistItemRecord[]> {
    const rows = await db.wishlistItem.findMany({ where: { userId }, orderBy: { addedAt: "desc" } });
    return rows.map(({ productId, addedAt }) => ({ productId, addedAt: addedAt.toISOString() }));
}

export async function addWishlistItem(userId: string, productId: string): Promise<boolean> {
    const result = await db.wishlistItem.createMany({ data: [{ userId, productId }], skipDuplicates: true });
    return result.count > 0;
}

export async function removeWishlistItem(userId: string, productId: string): Promise<void> {
    await db.wishlistItem.deleteMany({ where: { userId, productId } });
}
