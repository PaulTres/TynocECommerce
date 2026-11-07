/* eslint-disable @typescript-eslint/no-explicit-any*/
import { describe, expect, it, vi } from "vitest";
import ProductPage, { generateMetadata } from "./page";
import { NotFoundError } from "@/lib/errors";
import { AddToCartForm } from "@/components/AddToCartForm";
import { ProductGrid } from "@/components/ProductGrid";

/** Finds a mocked component element anywhere in a nested server component result. */
function findElement(node: any, type: unknown): any {
    if (Array.isArray(node)) {
        for (const child of node) {
            const match = findElement(child, type);
            if (match) return match;
        }
        return undefined;
    }
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    return findElement(node.props?.children, type);
}

const mocks = vi.hoisted(() => ({ user: vi.fn(), detail: vi.fn(), wishlist: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/api/session", () => ({ getUserId: mocks.user }));
vi.mock("@/services/product.service", () => ({ getProductDetail: mocks.detail }));
vi.mock("@/services/wishlist.service", () => ({ getWishlistIds: mocks.wishlist }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/image", () => ({ default: (props: unknown) => props }));
vi.mock("next/link", () => ({ default: (props: unknown) => props }));
vi.mock("@/components/AddToCartForm", () => ({ AddToCartForm: (props: unknown) => props }));
vi.mock("@/components/ProductGrid", () => ({ ProductGrid: (props: unknown) => props }));
vi.mock("@/components/WishlistButton", () => ({ WishlistButton: (props: unknown) => props }));

const product = { id: "linen-throw", name: "Linen throw", description: "A comfortable throw blanket.", priceCents: 3000, currency: "USD", categorySlug: "bedroom", images: ["/one.jpg", "/two.jpg"], stock: 3, tags: [], featured: false, createdAt: "2026-01-01" };

describe("ProductPage", () => {
    it("renders product details, gallery, purchase controls and related items", async () => {
        mocks.detail.mockResolvedValue({ product, category: { slug: "bedroom", name: "Bedroom" }, related: [{ id: "other" }] });
        mocks.user.mockResolvedValue("u1");
        mocks.wishlist.mockResolvedValue(new Set([product.id]));
        const result = await ProductPage({ params: Promise.resolve({ id: product.id }) }) as any;
        expect(mocks.detail).toHaveBeenCalledWith(product.id);
        expect(mocks.wishlist).toHaveBeenCalledWith("u1");
        expect(JSON.stringify(result).includes(product.name)).toBe(true);
        expect(findElement(result, AddToCartForm).props.maxQuantity).toBe(3);
        expect(findElement(result, ProductGrid).props.products).toEqual([{ id: "other" }]);
    });

    it("routes invalid IDs and missing products to notFound, but rethrows unrelated failures", async () => {
        mocks.notFound.mockClear();
        await expect(generateMetadata({ params: Promise.resolve({ id: "bad/id" }) })).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.notFound).toHaveBeenCalledOnce();
        mocks.detail.mockRejectedValueOnce(new NotFoundError("Missing"));
        await expect(generateMetadata({ params: Promise.resolve({ id: "not-here" }) })).rejects.toThrow("NEXT_NOT_FOUND");
        mocks.detail.mockRejectedValueOnce(new Error("database offline"));
        await expect(generateMetadata({ params: Promise.resolve({ id: "valid-id" }) })).rejects.toThrow("database offline");
    });

    it("exports product metadata", async () => {
        mocks.detail.mockResolvedValue({ product: { ...product, description: "x".repeat(200) }, category: null, related: [] });
        const result = await generateMetadata({ params: Promise.resolve({ id: product.id }) });
        expect(result.title).toBe(product.name);
        expect((result.description as string)).toHaveLength(160);
    });
});
