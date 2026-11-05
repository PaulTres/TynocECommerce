import { beforeEach, describe, expect, it, vi } from "vitest";

import * as productsRepo from "@/lib/db/products.repo";
import * as wishlistRepo from "@/lib/db/wishlist.repo";
import { NotFoundError } from "@/lib/errors";
import type { Product } from "@/types";

import {
    addToWishlist,
    getWishlist,
    getWishlistCount,
    getWishlistIds,
    removeFromWishlist,
} from "./wishlist.service";

vi.mock("@/lib/db/products.repo", () => ({
    getProduct: vi.fn(),
    batchGetProducts: vi.fn(),
}));

vi.mock("@/lib/db/wishlist.repo", () => ({
    listWishlist: vi.fn(),
    wishlistCount: vi.fn(),
    addWishlistItem: vi.fn(),
    removeWishlistItem: vi.fn(),
}));

const listWishlist = vi.mocked(wishlistRepo.listWishlist);
const wishlistCount = vi.mocked(wishlistRepo.wishlistCount);
const addWishlistItem = vi.mocked(wishlistRepo.addWishlistItem);
const removeWishlistItem = vi.mocked(wishlistRepo.removeWishlistItem);
const batchGetProducts = vi.mocked(productsRepo.batchGetProducts);
const getProduct = vi.mocked(productsRepo.getProduct);

type WishlistRows = Awaited<ReturnType<typeof wishlistRepo.listWishlist>>;

/**Builds a minimal Product fixture.*/
function makeProduct(
    id: string,
    overrides: Record<string, unknown> = {},
): Product {
    return { id, name: `Product ${id}`, ...overrides } as unknown as Product;
}

/**
 * Builds wishlist rows as the repo would return them (newest first).
 */
function makeRows(...productIds: string[]): WishlistRows {
    return productIds.map((productId) => ({
        userId: "user-1",
        productId,
    })) as unknown as WishlistRows;
}

describe("wishlist.service", () => {
    //reset every mock before each test
    beforeEach(() => {
        vi.resetAllMocks();
        listWishlist.mockResolvedValue(makeRows());
        wishlistCount.mockResolvedValue(0);
        addWishlistItem.mockResolvedValue(true);
        removeWishlistItem.mockResolvedValue(undefined as never);
        batchGetProducts.mockResolvedValue([]);
        getProduct.mockResolvedValue(undefined as never);
    });

    describe("getWishlist", () => {
        it("returns products in wishlist order (newest first), not in the order the batch lookup returns them", async () => {
            listWishlist.mockResolvedValue(makeRows("c", "a", "b"));
            batchGetProducts.mockResolvedValue([
                makeProduct("a"),
                makeProduct("b"),
                makeProduct("c"),
            ]);

            const result = await getWishlist("user-1");

            expect(result.map((p) => p.id)).toEqual(["c", "a", "b"]);
        });

        it("returns the full product objects untouched", async () => {
            const product = makeProduct("a", { price: 1999, inStock: true });
            listWishlist.mockResolvedValue(makeRows("a"));
            batchGetProducts.mockResolvedValue([product]);

            const [first] = await getWishlist("user-1");

            expect(first).toBe(product);
        });

        it("skips wishlist entries whose product no longer exists", async () => {
            listWishlist.mockResolvedValue(makeRows("a", "b", "c"));
            batchGetProducts.mockResolvedValue([
                makeProduct("a"),
                makeProduct("c"),
            ]);

            const result = await getWishlist("user-1");

            expect(result.map((p) => p.id)).toEqual(["a", "c"]);
        });

        it("returns an empty array when every wishlisted product has been deleted", async () => {
            listWishlist.mockResolvedValue(makeRows("a", "b"));
            batchGetProducts.mockResolvedValue([]);

            await expect(getWishlist("user-1")).resolves.toEqual([]);
        });

        it("returns an empty array for an empty wishlist", async () => {
            listWishlist.mockResolvedValue(makeRows());
            batchGetProducts.mockResolvedValue([]);

            await expect(getWishlist("user-1")).resolves.toEqual([]);
        });

        it("scopes the wishlist lookup to the requested user", async () => {
            await getWishlist("user-42");

            expect(listWishlist).toHaveBeenCalledTimes(1);
            expect(listWishlist).toHaveBeenCalledWith("user-42");
        });

        it("batch-fetches products with the ids in wishlist order, in a single call (no N+1)", async () => {
            listWishlist.mockResolvedValue(makeRows("c", "a", "b"));
            batchGetProducts.mockResolvedValue([]);

            await getWishlist("user-1");

            expect(batchGetProducts).toHaveBeenCalledTimes(1);
            expect(batchGetProducts).toHaveBeenCalledWith(["c", "a", "b"]);
            expect(getProduct).not.toHaveBeenCalled();
        });

        it("ignores products returned by the batch that are not on the wishlist", async () => {
            listWishlist.mockResolvedValue(makeRows("a"));
            batchGetProducts.mockResolvedValue([
                makeProduct("a"),
                makeProduct("zzz"),
            ]);

            const result = await getWishlist("user-1");

            expect(result.map((p) => p.id)).toEqual(["a"]);
        });

        it("propagates wishlist repo errors and does not query products", async () => {
            const error = new Error("DB down");
            listWishlist.mockRejectedValue(error);

            await expect(getWishlist("user-1")).rejects.toBe(error);
            expect(batchGetProducts).not.toHaveBeenCalled();
        });

        it("propagates product repo errors", async () => {
            const error = new Error("Batch failed");
            listWishlist.mockResolvedValue(makeRows("a"));
            batchGetProducts.mockRejectedValue(error);

            await expect(getWishlist("user-1")).rejects.toBe(error);
        });
    });

    describe("getWishlistIds", () => {
        it("returns a Set containing every wishlisted product id", async () => {
            listWishlist.mockResolvedValue(makeRows("a", "b", "c"));

            const ids = await getWishlistIds("user-1");

            expect(ids).toBeInstanceOf(Set);
            expect(ids).toEqual(new Set(["a", "b", "c"]));
        });

        it("returns an empty Set for an empty wishlist", async () => {
            const ids = await getWishlistIds("user-1");

            expect(ids.size).toBe(0);
        });

        it("de-duplicates ids (Set semantics)", async () => {
            listWishlist.mockResolvedValue(makeRows("a", "a", "b"));

            const ids = await getWishlistIds("user-1");

            expect(ids.size).toBe(2);
        });

        it("supports O(1) membership checks used for the filled-heart UI state", async () => {
            listWishlist.mockResolvedValue(makeRows("a"));

            const ids = await getWishlistIds("user-1");

            expect(ids.has("a")).toBe(true);
            expect(ids.has("b")).toBe(false);
        });

        it("does not hit the products repo", async () => {
            listWishlist.mockResolvedValue(makeRows("a"));

            await getWishlistIds("user-1");

            expect(batchGetProducts).not.toHaveBeenCalled();
            expect(getProduct).not.toHaveBeenCalled();
        });

        it("scopes the lookup to the requested user", async () => {
            await getWishlistIds("user-42");

            expect(listWishlist).toHaveBeenCalledWith("user-42");
        });

        it("propagates repo errors", async () => {
            const error = new Error("DB down");
            listWishlist.mockRejectedValue(error);

            await expect(getWishlistIds("user-1")).rejects.toBe(error);
        });
    });

    describe("getWishlistCount", () => {
        it("returns the count from the repo", async () => {
            wishlistCount.mockResolvedValue(7);

            await expect(getWishlistCount("user-1")).resolves.toBe(7);
        });

        it("returns 0 for a user with no wishlist items", async () => {
            wishlistCount.mockResolvedValue(0);

            await expect(getWishlistCount("user-1")).resolves.toBe(0);
        });

        it("delegates to the dedicated count query instead of loading all rows", async () => {
            await getWishlistCount("user-42");

            expect(wishlistCount).toHaveBeenCalledTimes(1);
            expect(wishlistCount).toHaveBeenCalledWith("user-42");
            expect(listWishlist).not.toHaveBeenCalled();
        });

        it("propagates repo errors", async () => {
            const error = new Error("DB down");
            wishlistCount.mockRejectedValue(error);

            await expect(getWishlistCount("user-1")).rejects.toBe(error);
        });
    });

    describe("addToWishlist", () => {
        it("returns true when the product is newly added", async () => {
            getProduct.mockResolvedValue(makeProduct("a"));
            addWishlistItem.mockResolvedValue(true);

            await expect(addToWishlist("user-1", "a")).resolves.toBe(true);
        });

        it("returns false when the product was already on the wishlist (idempotent)", async () => {
            getProduct.mockResolvedValue(makeProduct("a"));
            addWishlistItem.mockResolvedValue(false);

            await expect(addToWishlist("user-1", "a")).resolves.toBe(false);
        });

        it("passes the correct user and product ids to the repo", async () => {
            getProduct.mockResolvedValue(makeProduct("p-9"));

            await addToWishlist("user-42", "p-9");

            expect(getProduct).toHaveBeenCalledWith("p-9");
            expect(addWishlistItem).toHaveBeenCalledTimes(1);
            expect(addWishlistItem).toHaveBeenCalledWith("user-42", "p-9");
        });

        it("throws NotFoundError for an unknown product", async () => {
            getProduct.mockResolvedValue(undefined as never);

            await expect(
                addToWishlist("user-1", "missing"),
            ).rejects.toBeInstanceOf(NotFoundError);
        });

        it("uses the 'Product not found' message for unknown products", async () => {
            getProduct.mockResolvedValue(undefined as never);

            await expect(addToWishlist("user-1", "missing")).rejects.toThrow(
                "Product not found",
            );
        });

        it("treats a null product as not found", async () => {
            getProduct.mockResolvedValue(null as never);

            await expect(
                addToWishlist("user-1", "missing"),
            ).rejects.toBeInstanceOf(NotFoundError);
        });

        it("does not write to the wishlist when the product does not exist", async () => {
            getProduct.mockResolvedValue(undefined as never);

            await expect(addToWishlist("user-1", "missing")).rejects.toThrow();

            expect(addWishlistItem).not.toHaveBeenCalled();
        });

        it("validates the product before writing (call order)", async () => {
            getProduct.mockResolvedValue(makeProduct("a"));

            await addToWishlist("user-1", "a");

            const getOrder = getProduct.mock.invocationCallOrder[0];
            const addOrder = addWishlistItem.mock.invocationCallOrder[0];
            expect(getOrder).toBeLessThan(addOrder);
        });

        it("propagates product lookup errors without writing", async () => {
            const error = new Error("Lookup failed");
            getProduct.mockRejectedValue(error);

            await expect(addToWishlist("user-1", "a")).rejects.toBe(error);
            expect(addWishlistItem).not.toHaveBeenCalled();
        });

        it("propagates wishlist write errors", async () => {
            const error = new Error("Write failed");
            getProduct.mockResolvedValue(makeProduct("a"));
            addWishlistItem.mockRejectedValue(error);

            await expect(addToWishlist("user-1", "a")).rejects.toBe(error);
        });
    });

    describe("removeFromWishlist", () => {
        it("delegates to the repo with the correct user and product ids", async () => {
            await removeFromWishlist("user-42", "p-9");

            expect(removeWishlistItem).toHaveBeenCalledTimes(1);
            expect(removeWishlistItem).toHaveBeenCalledWith("user-42", "p-9");
        });

        it("resolves to undefined regardless of what the repo returns", async () => {
            removeWishlistItem.mockResolvedValue("something" as never);

            await expect(
                removeFromWishlist("user-1", "a"),
            ).resolves.toBeUndefined();
        });

        it("does not require the product to still exist (allows cleaning up stale entries)", async () => {
            await removeFromWishlist("user-1", "deleted-product");

            expect(getProduct).not.toHaveBeenCalled();
            expect(removeWishlistItem).toHaveBeenCalled();
        });

        it("is idempotent: removing an item that is not on the wishlist does not throw", async () => {
            removeWishlistItem.mockResolvedValue(undefined as never);

            await expect(
                removeFromWishlist("user-1", "not-there"),
            ).resolves.toBeUndefined();
        });

        it("propagates repo errors", async () => {
            const error = new Error("Delete failed");
            removeWishlistItem.mockRejectedValue(error);

            await expect(removeFromWishlist("user-1", "a")).rejects.toBe(error);
        });
    });

    describe("integration of add / get / remove (in-memory fake repos)", () => {
        /*
         * Wires the mocks to a tiny in-memory store so we can assert end-to-end
         * behaviour of the service (add -> read -> remove) without a database.
         * Catches wiring mistakes the isolated unit tests cannot, such as
         * passing arguments in the wrong order.
         */
        beforeEach(() => {
            const catalogue = new Map([
                ["a", makeProduct("a")],
                ["b", makeProduct("b")],
            ]);
            let items: string[] = [];

            getProduct.mockImplementation(
                async (id: string) => catalogue.get(id) as never,
            );
            batchGetProducts.mockImplementation(
                async (ids: string[]) =>
                    ids.map((id) => catalogue.get(id)).filter(Boolean) as never,
            );
            addWishlistItem.mockImplementation(
                async (_user: string, id: string) => {
                    if (items.includes(id)) return false;
                    items = [id, ...items];
                    return true;
                },
            );
            removeWishlistItem.mockImplementation(
                async (_user: string, id: string) => {
                    items = items.filter((i) => i !== id);
                    return undefined as never;
                },
            );
            listWishlist.mockImplementation(async () => makeRows(...items));
            wishlistCount.mockImplementation(async () => items.length);
        });

        it("supports a full add -> list -> duplicate add -> remove lifecycle", async () => {
            expect(await addToWishlist("user-1", "a")).toBe(true);
            expect(await addToWishlist("user-1", "b")).toBe(true);
            expect(await addToWishlist("user-1", "a")).toBe(false); // duplicate

            expect((await getWishlist("user-1")).map((p) => p.id)).toEqual([
                "b",
                "a",
            ]);
            expect(await getWishlistIds("user-1")).toEqual(new Set(["a", "b"]));
            expect(await getWishlistCount("user-1")).toBe(2);

            await removeFromWishlist("user-1", "b");

            expect((await getWishlist("user-1")).map((p) => p.id)).toEqual([
                "a",
            ]);
            expect(await getWishlistCount("user-1")).toBe(1);
        });

        it("rejects unknown products without changing the wishlist", async () => {
            await expect(
                addToWishlist("user-1", "nope"),
            ).rejects.toBeInstanceOf(NotFoundError);

            expect(await getWishlistCount("user-1")).toBe(0);
        });
    });
});
