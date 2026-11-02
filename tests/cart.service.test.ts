import type { Product } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Repositories are mocked so these tests exercise only business logic.
vi.mock("@/lib/db/cart.repo", () => ({
    listCartItems: vi.fn(),
    incrementItem: vi.fn(),
    setQuantity: vi.fn(),
    removeItem: vi.fn(),
}));
vi.mock("@/lib/db/products.repo", () => ({
    getProduct: vi.fn(),
    batchGetProducts: vi.fn(),
}));

import * as cartRepo from "@/lib/db/cart.repo";
import * as productsRepo from "@/lib/db/products.repo";
import * as cart from "@/services/cart.service";

const MUG_PRICE = 1250;
const PAN_PRICE = 4000;

const product = (over: Partial<Product> = {}): Product => ({
    id: "mug",
    name: "Mug",
    description: "",
    priceCents: MUG_PRICE,
    currency: "USD",
    categorySlug: "kitchen",
    images: [],
    stock: 5,
    tags: [],
    featured: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...over,
});

describe("cart.service", () => {
    beforeEach(() => vi.resetAllMocks());

    it("calculates line totals and subtotal in integer cents", async () => {
        vi.mocked(cartRepo.listCartItems).mockResolvedValue([
            { productId: "mug", quantity: 3, addedAt: "", updatedAt: "" },
            { productId: "pan", quantity: 1, addedAt: "", updatedAt: "" },
        ]);
        vi.mocked(productsRepo.batchGetProducts).mockResolvedValue([
            product(),
            product({ id: "pan", priceCents: PAN_PRICE }),
        ]);
        const result = await cart.getCart("u1");
        expect(result.subtotalCents).toBe(3 * MUG_PRICE + PAN_PRICE);
        expect(result.itemCount).toBe(4);
    });

    it("flags lines that exceed stock", async () => {
        vi.mocked(cartRepo.listCartItems).mockResolvedValue([
            { productId: "mug", quantity: 4, addedAt: "", updatedAt: "" },
        ]);
        vi.mocked(productsRepo.batchGetProducts).mockResolvedValue([
            product({ stock: 2 }),
        ]);
        expect((await cart.getCart("u1")).lines[0]?.exceedsStock).toBe(true);
    });

    it("rejects adding out-of-stock products", async () => {
        vi.mocked(productsRepo.getProduct).mockResolvedValue(
            product({ stock: 0 }),
        );
        await expect(cart.addToCart("u1", "mug", 1)).rejects.toThrow(
            /out of stock/i,
        );
    });

    it("removes the line when quantity is set to 0", async () => {
        await cart.updateQuantity("u1", "mug", 0);
        expect(cartRepo.removeItem).toHaveBeenCalledWith("u1", "mug");
        expect(cartRepo.setQuantity).not.toHaveBeenCalled();
    });
});
