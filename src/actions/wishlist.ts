"use server";

import { runAction } from "@/lib/api/action";
import { requireUserId } from "@/lib/api/session";
import { productIdSchema } from "@/lib/validation/schemas";
import * as wishlistService from "@/services/wishlist.service";
import type { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";

/** Adds a product to the wishlist. */
export async function addToWishlistAction(
    productId: unknown,
): Promise<ActionResult> {
    return runAction(async () => {
        const userId = await requireUserId();
        await wishlistService.addToWishlist(
            userId,
            productIdSchema.parse(productId),
        );
        revalidatePath("/wishlist");
    });
}

/** Removes a product from the wishlist. */
export async function removeFromWishlistAction(
    productId: unknown,
): Promise<ActionResult> {
    return runAction(async () => {
        const userId = await requireUserId();
        await wishlistService.removeFromWishlist(
            userId,
            productIdSchema.parse(productId),
        );
        revalidatePath("/wishlist");
    });
}
