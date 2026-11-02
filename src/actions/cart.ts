"use server";

import { runAction } from "@/lib/api/action";
import { requireUserId } from "@/lib/api/session";
import {
  addToCartSchema,
  productIdSchema,
  updateCartSchema,
} from "@/lib/validation/schemas";
import * as cartService from "@/services/cart.service";
import type { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";

/** Adds an item to the cart; returns the line's new quantity. */
export async function addToCartAction(
    input: unknown,
): Promise<ActionResult<{ quantity: number }>> {
    return runAction(async () => {
        const userId = await requireUserId();
        const { productId, quantity } = addToCartSchema.parse(input);
        const newQuantity = await cartService.addToCart(
            userId,
            productId,
            quantity,
        );
        revalidatePath("/", "layout"); // refreshes the header badge and cart page
        return { quantity: newQuantity };
    });
}

/** Sets a line to an exact quantity (0 removes it). */
export async function updateCartQuantityAction(
    input: unknown,
): Promise<ActionResult> {
    return runAction(async () => {
        const userId = await requireUserId();
        const { productId, quantity } = updateCartSchema.parse(input);
        await cartService.updateQuantity(userId, productId, quantity);
        revalidatePath("/", "layout");
    });
}

/** Removes a line from the cart. */
export async function removeFromCartAction(
    productId: unknown,
): Promise<ActionResult> {
    return runAction(async () => {
        const userId = await requireUserId();
        await cartService.removeFromCart(
            userId,
            productIdSchema.parse(productId),
        );
        revalidatePath("/", "layout");
    });
}
