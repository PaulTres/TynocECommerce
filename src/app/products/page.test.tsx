/* eslint-disable @typescript-eslint/no-explicit-any -- mocked server component elements are inspected as test data. */
import { describe, expect, it, vi } from "vitest";
import ProductsPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({ user: vi.fn(), categories: vi.fn(), search: vi.fn(), wishlist: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ getUserId: mocks.user }));
vi.mock("@/services/product.service", () => ({ getCategories: mocks.categories, searchProducts: mocks.search }));
vi.mock("@/services/wishlist.service", () => ({ getWishlistIds: mocks.wishlist }));
vi.mock("@/components/ProductFilters", () => ({ ProductFilters: (props: unknown) => props }));
vi.mock("@/components/ProductGrid", () => ({ ProductGrid: (props: unknown) => props }));
vi.mock("next/link", () => ({ default: (props: unknown) => props }));

describe("ProductsPage", () => {
    // Valid filters become normalized service input and use auth-only wishlist lookup.
    it("normalizes repeated query values, prices, and signed-in wishlist state", async () => {
        mocks.user.mockResolvedValue("u1");
        mocks.categories.mockResolvedValue([]);
        mocks.wishlist.mockResolvedValue(new Set(["p1"]));
        const page = { items: [{ id: "p1" }], prevCursor: undefined, nextCursor: "next" };
        mocks.search.mockResolvedValue(page);
        const result = await ProductsPage({ searchParams: Promise.resolve({ q: ["linen", "ignored"], min: "10.25", max: "50", sort: "price-asc" }) }) as any;
        expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ search: "linen", minPriceCents: 1025, maxPriceCents: 5000, sort: "price-asc" }));
        expect(mocks.wishlist).toHaveBeenCalledWith("u1");
        const grid = result.props.children[2];
        expect(grid.props.products).toBe(page.items);
        expect(grid.props.signedIn).toBe(true);
        expect(grid.props.wishlistIds).toEqual(new Set(["p1"]));
        expect(result.props.children[3].props.children[1].props.href).toContain("nextCursor=next");
    });

    // Invalid filters are shown to the user and never reach the product query service.
    it("rejects invalid query values without searching", async () => {
        mocks.user.mockResolvedValue(null);
        mocks.categories.mockResolvedValue([]);
        mocks.search.mockClear();
        const result = await ProductsPage({ searchParams: Promise.resolve({ min: "-1", sort: "nope" }) }) as any;
        expect(mocks.search).not.toHaveBeenCalled();
        const form = result.props.children[1];
        expect(form.props.validationErrors.length).toBeGreaterThan(0);
        expect(result.props.children[2].props.role).toBe("status");
    });

    // An anonymous browse does not spend a wishlist query.
    it("searches without requesting wishlist data for anonymous users", async () => {
        mocks.user.mockResolvedValue(null);
        mocks.categories.mockResolvedValue([]);
        mocks.search.mockResolvedValue({ items: [], prevCursor: undefined, nextCursor: undefined });
        mocks.wishlist.mockClear();
        await ProductsPage({ searchParams: Promise.resolve({ category: "home" }) });
        expect(mocks.wishlist).not.toHaveBeenCalled();
    });

    // Listing metadata is part of the shop route contract.
    it("sets the shop title", () => { expect(metadata).toEqual({ title: "Shop" }); });
});
