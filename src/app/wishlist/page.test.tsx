/* eslint-disable @typescript-eslint/no-explicit-any -- mocked server component elements are inspected as test data. */
import { describe, expect, it, vi } from "vitest";
import WishlistPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({ userId: vi.fn(), wishlist: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ requireUserId: mocks.userId }));
vi.mock("@/services/wishlist.service", () => ({ getWishlist: mocks.wishlist }));
vi.mock("@/components/EmptyState", () => ({
    EmptyState: (props: unknown) => props,
}));
vi.mock("@/components/ProductGrid", () => ({
    ProductGrid: (props: unknown) => props,
}));

describe("WishlistPage", () => {
    it("requires the current user and provides an empty state", async () => {
        mocks.userId.mockResolvedValue("u1");
        mocks.wishlist.mockResolvedValue([]);
        const result = (await WishlistPage()) as any;
        expect(mocks.wishlist).toHaveBeenCalledWith("u1");
        const emptyState = result.props.children[1];
        expect(emptyState.props.title).toBe("No saved items yet");
        expect(emptyState.props.actionHref).toBe("/products");
    });

    it("renders saved products with matching wishlist flags", async () => {
        const products = [{ id: "p1" }, { id: "p2" }];
        mocks.userId.mockResolvedValue("u2");
        mocks.wishlist.mockResolvedValue(products);
        const result = (await WishlistPage()) as any;
        const grid = result.props.children[1];
        expect(grid.props.products).toBe(products);
        expect([...grid.props.wishlistIds]).toEqual(["p1", "p2"]);
        expect(grid.props.signedIn).toBe(true);
    });

    it("sets the wishlist title", () => {
        expect(metadata).toEqual({ title: "Wishlist" });
    });
});
