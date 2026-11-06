
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before importing the actions.
vi.mock("@/lib/api/action", () => ({
    runAction: vi.fn(async (callback) => {
        try {
            return {
                ok: true,
                data: await callback(),
            };
        } catch (error) {
            return {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            };
        }
    }),
}));

vi.mock("@/lib/api/session", () => ({
    requireUserId: vi.fn(),
}));

vi.mock("@/services/cart.service", () => ({
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

import {
    addToCartAction,
    updateCartQuantityAction,
    removeFromCartAction,
} from "@/actions/cart";

import { requireUserId } from "@/lib/api/session";
import * as cartService from "@/services/cart.service";
import { revalidatePath } from "next/cache";

describe("Cart actions", () => {
    const userId = "user-123";
    const productId = "product-456";

    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(requireUserId).mockResolvedValue(userId);

        vi.mocked(cartService.addToCart).mockResolvedValue(3);
        vi.mocked(cartService.updateQuantity).mockResolvedValue(undefined);
        vi.mocked(cartService.removeFromCart).mockResolvedValue(undefined);
    });

    describe("addToCartAction", () => {
        it("adds a product to the cart and returns the new quantity", async () => {
            const result = await addToCartAction({
                productId,
                quantity: 2,
            });

            expect(result).toEqual({
                ok: true,
                data: {
                    quantity: 3,
                },
            });

            expect(requireUserId).toHaveBeenCalledOnce();

            expect(cartService.addToCart).toHaveBeenCalledWith(
                userId,
                productId,
                2,
            );

            expect(revalidatePath).toHaveBeenCalledOnce();
            expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
        });

        it("returns the quantity returned by the cart service", async () => {
            vi.mocked(cartService.addToCart).mockResolvedValue(5);

            const result = await addToCartAction({
                productId,
                quantity: 1,
            });

            expect(result).toEqual({
                ok: true,
                data: {
                    quantity: 5,
                },
            });
        });

        it("requires authentication before adding a product", async () => {
            vi.mocked(requireUserId).mockRejectedValue(
                new Error("Unauthorized"),
            );

            const result = await addToCartAction({
                productId,
                quantity: 1,
            });

            expect(result).toEqual({
                ok: false,
                error: "Unauthorized",
            });

            expect(cartService.addToCart).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("rejects invalid input", async () => {
            const result = await addToCartAction({
                productId: "invalid",
                quantity: -1,
            });

            expect(result.ok).toBe(false);
            expect(cartService.addToCart).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("rejects missing input", async () => {
            const result = await addToCartAction(undefined);

            expect(result.ok).toBe(false);
            expect(cartService.addToCart).not.toHaveBeenCalled();
        });

        it("returns an error when the cart service fails", async () => {
            vi.mocked(cartService.addToCart).mockRejectedValue(
                new Error("Unable to add product"),
            );

            const result = await addToCartAction({
                productId,
                quantity: 1,
            });

            expect(result).toEqual({
                ok: false,
                error: "Unable to add product",
            });

            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("updateCartQuantityAction", () => {
        it("updates a cart line quantity", async () => {
            const result = await updateCartQuantityAction({
                productId,
                quantity: 4,
            });

            expect(result).toEqual({
                ok: true,
                data: undefined,
            });

            expect(requireUserId).toHaveBeenCalledOnce();

            expect(cartService.updateQuantity).toHaveBeenCalledWith(
                userId,
                productId,
                4,
            );

            expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
        });

        it("allows a quantity of zero to remove a cart line", async () => {
            const result = await updateCartQuantityAction({
                productId,
                quantity: 0,
            });

            expect(result.ok).toBe(true);

            expect(cartService.updateQuantity).toHaveBeenCalledWith(
                userId,
                productId,
                0,
            );

            expect(revalidatePath).toHaveBeenCalledOnce();
        });

        it("requires authentication before updating the cart", async () => {
            vi.mocked(requireUserId).mockRejectedValue(
                new Error("Unauthorized"),
            );

            const result = await updateCartQuantityAction({
                productId,
                quantity: 2,
            });

            expect(result).toEqual({
                ok: false,
                error: "Unauthorized",
            });

            expect(cartService.updateQuantity).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("rejects invalid product IDs", async () => {
            const result = await updateCartQuantityAction({
                productId: "",
                quantity: 2,
            });

            expect(result.ok).toBe(false);
            expect(cartService.updateQuantity).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("rejects negative quantities", async () => {
            const result = await updateCartQuantityAction({
                productId,
                quantity: -1,
            });

            expect(result.ok).toBe(false);
            expect(cartService.updateQuantity).not.toHaveBeenCalled();
        });

        it("rejects missing input", async () => {
            const result = await updateCartQuantityAction(undefined);

            expect(result.ok).toBe(false);
            expect(cartService.updateQuantity).not.toHaveBeenCalled();
        });

        it("returns an error when the cart service fails", async () => {
            vi.mocked(cartService.updateQuantity).mockRejectedValue(
                new Error("Unable to update cart"),
            );

            const result = await updateCartQuantityAction({
                productId,
                quantity: 2,
            });

            expect(result).toEqual({
                ok: false,
                error: "Unable to update cart",
            });

            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("removeFromCartAction", () => {
        it("removes a product from the cart", async () => {
            const result = await removeFromCartAction(productId);

            expect(result).toEqual({
                ok: true,
                data: undefined,
            });

            expect(requireUserId).toHaveBeenCalledOnce();

            expect(cartService.removeFromCart).toHaveBeenCalledWith(
                userId,
                productId,
            );

            expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
        });

        it("requires authentication before removing a product", async () => {
            vi.mocked(requireUserId).mockRejectedValue(
                new Error("Unauthorized"),
            );

            const result = await removeFromCartAction(productId);

            expect(result).toEqual({
                ok: false,
                error: "Unauthorized",
            });

            expect(cartService.removeFromCart).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("rejects an invalid product ID", async () => {
            const result = await removeFromCartAction("");

            expect(result.ok).toBe(false);
            expect(cartService.removeFromCart).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("rejects an undefined product ID", async () => {
            const result = await removeFromCartAction(undefined);

            expect(result.ok).toBe(false);
            expect(cartService.removeFromCart).not.toHaveBeenCalled();
        });

        it("rejects a non-string product ID", async () => {
            const result = await removeFromCartAction(123);

            expect(result.ok).toBe(false);
            expect(cartService.removeFromCart).not.toHaveBeenCalled();
        });

        it("returns an error when the cart service fails", async () => {
            vi.mocked(cartService.removeFromCart).mockRejectedValue(
                new Error("Unable to remove product"),
            );

            const result = await removeFromCartAction(productId);

            expect(result).toEqual({
                ok: false,
                error: "Unable to remove product",
            });

            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });
});
