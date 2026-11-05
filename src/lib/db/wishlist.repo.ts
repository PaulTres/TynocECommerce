import type { WishlistItemRecord } from "@/types";
import { dataApi } from "./data-api";

function asIso(value: Date | string): string {
    try {
        return value instanceof Date
            ? value.toISOString()
            : new Date(value).toISOString();
    } catch (e) {
        console.error(e);
        return "unknown";
    }
}

export async function wishlistCount(userId: string): Promise<number> {
    const query = new URLSearchParams({
        select: "count()",
        userId: `eq.${userId}`,
    });

    const rows = await dataApi<{ count: number }[]>("WishlistItem", {
        access: "authenticated",
        query,
    });

    return Number(rows[0]?.count ?? 0);
}

export async function listWishlist(
    userId: string,
): Promise<WishlistItemRecord[]> {
    const query = new URLSearchParams({
        select: "productId,addedAt",
        userId: `eq.${userId}`,
        order: "addedAt.desc",
    });
    const rows = await dataApi<
        {
            productId: string;
            addedAt: string;
        }[]
    >("WishlistItem", { access: "authenticated", query });
    return rows.map((row) => ({
        productId: String(row.productId),
        addedAt: asIso(row.addedAt as string | Date),
    }));
}

export async function addWishlistItem(
    userId: string,
    productId: string,
): Promise<boolean> {
    const rows = await dataApi<{ productId: string }[]>("WishlistItem", {
        access: "authenticated",
        method: "POST",
        query: new URLSearchParams({ on_conflict: "userId,productId" }),
        body: { userId, productId },
        prefer: "resolution=ignore-duplicates,return=representation",
    });
    return rows.length > 0;
}

export async function removeWishlistItem(
    userId: string,
    productId: string,
): Promise<void> {
    const query = new URLSearchParams({
        userId: `eq.${userId}`,
        productId: `eq.${productId}`,
    });
    await dataApi<unknown>("WishlistItem", {
        access: "authenticated",
        method: "DELETE",
        query,
    });
}
