import { ConflictError, NotFoundError } from "@/lib/errors";
import type { CartItemRecord } from "@/types";
import { dataApi } from "./data-api";

function asIso(value: Date | string): string {
    return value instanceof Date
        ? value.toISOString()
        : new Date(value).toISOString();
}

export async function listCartItems(userId: string): Promise<CartItemRecord[]> {
    const query = new URLSearchParams({
        select: "productId,quantity,addedAt,updatedAt",
        userId: `eq.${userId}`,
        order: "addedAt.asc",
    });
    const rows = await dataApi<
        {
            productId: string;
            quantity: number;
            addedAt: string;
            updatedAt: string;
        }[]
    >("CartItem", { access: "authenticated", query });
    return rows.map((row) => ({
        productId: String(row.productId),
        quantity: Number(row.quantity),
        addedAt: asIso(row.addedAt as Date | string),
        updatedAt: asIso(row.updatedAt as Date | string),
    }));
}

/** Fetches only quantities so the header badge avoids loading product details. */
export async function sumCartQuantities(userId: string): Promise<number> {
    const query = new URLSearchParams({
        select: "quantity",
        userId: `eq.${userId}`,
    });
    const rows = await dataApi<{ quantity: number }[]>("CartItem", {
        access: "authenticated",
        query,
    });
    return rows.reduce((total, row) => total + Number(row.quantity), 0);
}

/** Adds atomically and enforces the line cap even under concurrent requests. */
export async function incrementItem(
    userId: string,
    productId: string,
    qty: number,
    cap: number,
): Promise<number> {
    if (qty > cap)
        throw new ConflictError(`You can add at most ${cap} of this item`);

    const quantity = await dataApi<number | null>("rpc/increment_cart_item", {
        access: "authenticated",
        method: "POST",
        body: {
            p_user_id: userId,
            p_product_id: productId,
            p_qty: qty,
            p_cap: cap,
        },
    });
    if (quantity === null)
        throw new ConflictError(
            `You can have at most ${cap} of this item in your cart`,
        );
    return Number(quantity);
}

export async function setQuantity(
    userId: string,
    productId: string,
    quantity: number,
): Promise<void> {
    const query = new URLSearchParams({
        userId: `eq.${userId}`,
        productId: `eq.${productId}`,
        select: "productId",
    });
    const rows = await dataApi<{ productId: string }[]>("CartItem", {
        access: "authenticated",
        method: "PATCH",
        query,
        body: { quantity, updatedAt: new Date().toISOString() },
        prefer: "return=representation",
    });
    if (rows.length === 0)
        throw new NotFoundError("That item is not in your cart");
}

export async function removeItem(
    userId: string,
    productId: string,
): Promise<void> {
    const query = new URLSearchParams({
        userId: `eq.${userId}`,
        productId: `eq.${productId}`,
    });
    await dataApi<unknown>("CartItem", {
        access: "authenticated",
        method: "DELETE",
        query,
    });
}
