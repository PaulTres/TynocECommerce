import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./data-api", () => ({
    dataApi: vi.fn(),
}));

import { dataApi } from "./data-api";
import {
    addWishlistItem,
    listWishlist,
    removeWishlistItem,
    wishlistCount,
} from "./wishlist.repo";

const dataApiMock = vi.mocked(dataApi);

/**
 * Pulls the options object (2nd argument) from the most recent dataApi call.
 */
function lastCallOptions() {
    const call = dataApiMock.mock.calls.at(-1);
    if (!call) throw new Error("dataApi was not called");
    return call[1] as {
        access: string;
        method?: string;
        query?: URLSearchParams;
        body?: unknown;
        prefer?: string;
    };
}

function queryToObject(query?: URLSearchParams): Record<string, string> {
    return Object.fromEntries(query?.entries() ?? []);
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("wishlistCount", () => {
    it("queries the WishlistItem table with count() filtered by user, as authenticated", async () => {
        dataApiMock.mockResolvedValueOnce([{ count: 3 }]);

        await wishlistCount("user-1");

        expect(dataApiMock).toHaveBeenCalledTimes(1);
        expect(dataApiMock.mock.calls[0][0]).toBe("WishlistItem");

        const opts = lastCallOptions();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBeUndefined();
        expect(queryToObject(opts.query)).toEqual({
            select: "count()",
            userId: "eq.user-1",
        });
    });

    it("returns the numeric count from the first row", async () => {
        dataApiMock.mockResolvedValueOnce([{ count: 7 }]);
        await expect(wishlistCount("user-1")).resolves.toBe(7);
    });

    it("coerces string counts to numbers (some backends return bigint as string)", async () => {
        dataApiMock.mockResolvedValueOnce([
            { count: "12" as unknown as number },
        ]);
        await expect(wishlistCount("user-1")).resolves.toBe(12);
    });

    it("returns 0 when the API returns no rows", async () => {
        dataApiMock.mockResolvedValueOnce([]);
        await expect(wishlistCount("user-1")).resolves.toBe(0);
    });

    it("returns 0 when count is null/undefined", async () => {
        dataApiMock.mockResolvedValueOnce([
            { count: null as unknown as number },
        ]);
        await expect(wishlistCount("user-1")).resolves.toBe(0);

        dataApiMock.mockResolvedValueOnce([{} as { count: number }]);
        await expect(wishlistCount("user-1")).resolves.toBe(0);
    });

    it("safely encodes hostile userId values so they cannot inject extra query params", async () => {
        dataApiMock.mockResolvedValueOnce([{ count: 0 }]);

        await wishlistCount("abc&select=*&userId=neq.x");

        const { query } = lastCallOptions();
        expect(query?.get("userId")).toBe("eq.abc&select=*&userId=neq.x");
        expect(query?.getAll("select")).toEqual(["count()"]);
        expect(query?.toString()).not.toContain("&select=*");
    });

    it("propagates errors from the data API", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("network down"));
        await expect(wishlistCount("user-1")).rejects.toThrow("network down");
    });
});

describe("listWishlist", () => {
    it("requests productId/addedAt for the user ordered newest-first", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await listWishlist("user-1");

        expect(dataApiMock.mock.calls[0][0]).toBe("WishlistItem");
        const opts = lastCallOptions();
        expect(opts.access).toBe("authenticated");
        expect(queryToObject(opts.query)).toEqual({
            select: "productId,addedAt",
            userId: "eq.user-1",
            order: "addedAt.desc",
        });
    });

    it("maps rows to WishlistItemRecord with normalised ISO timestamps", async () => {
        dataApiMock.mockResolvedValueOnce([
            { productId: "p1", addedAt: "2024-03-01T12:00:00.000Z" },
            { productId: "p2", addedAt: "2024-02-01T00:00:00Z" },
        ]);

        const result = await listWishlist("user-1");

        expect(result).toEqual([
            { productId: "p1", addedAt: "2024-03-01T12:00:00.000Z" },
            { productId: "p2", addedAt: "2024-02-01T00:00:00.000Z" },
        ]);
    });

    it("accepts Date instances for addedAt (e.g. when the data layer hydrates dates)", async () => {
        const date = new Date("2024-06-15T08:30:00.000Z");
        dataApiMock.mockResolvedValueOnce([
            { productId: "p1", addedAt: date as unknown as string },
        ]);

        const [item] = await listWishlist("user-1");
        expect(item.addedAt).toBe("2024-06-15T08:30:00.000Z");
    });

    it("coerces non-string productIds to strings", async () => {
        dataApiMock.mockResolvedValueOnce([
            {
                productId: 42 as unknown as string,
                addedAt: "2024-01-01T00:00:00Z",
            },
        ]);

        const [item] = await listWishlist("user-1");
        expect(item.productId).toBe("42");
        expect(typeof item.productId).toBe("string");
    });

    it("returns an empty array when the user has no wishlist items", async () => {
        dataApiMock.mockResolvedValueOnce([]);
        await expect(listWishlist("user-1")).resolves.toEqual([]);
    });

    it("returns unknown for invalid dates", async () => {
        dataApiMock.mockResolvedValueOnce([
            { productId: "p1", addedAt: "not-a-date" },
        ]);

        const result = await listWishlist("user-1");
        expect(result).toEqual([
            {
                addedAt: "unknown",
                productId: "p1",
            },
        ]);
        //await expect(listWishlist("user-1")).rejects.toThrow(RangeError);
    });

    it("propagates errors from the data API", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("boom"));
        await expect(listWishlist("user-1")).rejects.toThrow("boom");
    });
});

describe("addWishlistItem", () => {
    it("posts an upsert-ignore request with the correct body, conflict target and prefer header", async () => {
        dataApiMock.mockResolvedValueOnce([{ productId: "p1" }]);

        await addWishlistItem("user-1", "p1");

        expect(dataApiMock.mock.calls[0][0]).toBe("WishlistItem");
        const opts = lastCallOptions();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBe("POST");
        expect(queryToObject(opts.query)).toEqual({
            on_conflict: "userId,productId",
        });
        expect(opts.body).toEqual({ userId: "user-1", productId: "p1" });
        expect(opts.prefer).toBe(
            "resolution=ignore-duplicates,return=representation",
        );
    });

    it("returns true when a new row was inserted", async () => {
        dataApiMock.mockResolvedValueOnce([{ productId: "p1" }]);
        await expect(addWishlistItem("user-1", "p1")).resolves.toBe(true);
    });

    it("returns false when the item already existed (ignore-duplicates yields no rows)", async () => {
        dataApiMock.mockResolvedValueOnce([]);
        await expect(addWishlistItem("user-1", "p1")).resolves.toBe(false);
    });

    it("keeps hostile ids inside the JSON body rather than the query string", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await addWishlistItem("u'; DROP TABLE x;--", "p&1");

        const opts = lastCallOptions();
        expect(opts.body).toEqual({
            userId: "u'; DROP TABLE x;--",
            productId: "p&1",
        });
        expect(queryToObject(opts.query)).toEqual({
            on_conflict: "userId,productId",
        });
    });

    it("propagates errors (e.g. FK violation for unknown product)", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("foreign key violation"));
        await expect(addWishlistItem("user-1", "missing")).rejects.toThrow(
            "foreign key violation",
        );
    });
});

describe("removeWishlistItem", () => {
    it("sends a DELETE filtered by both userId and productId", async () => {
        dataApiMock.mockResolvedValueOnce(undefined);

        await removeWishlistItem("user-1", "p1");

        expect(dataApiMock.mock.calls[0][0]).toBe("WishlistItem");
        const opts = lastCallOptions();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBe("DELETE");
        expect(queryToObject(opts.query)).toEqual({
            userId: "eq.user-1",
            productId: "eq.p1",
        });
    });

    it("never issues an unfiltered DELETE (guards against wiping the whole table)", async () => {
        dataApiMock.mockResolvedValueOnce(undefined);

        await removeWishlistItem("user-1", "p1");

        const { query } = lastCallOptions();
        expect(query?.has("userId")).toBe(true);
        expect(query?.has("productId")).toBe(true);
    });

    it("resolves to undefined and ignores whatever the API returns", async () => {
        dataApiMock.mockResolvedValueOnce({ deleted: 1 });
        await expect(
            removeWishlistItem("user-1", "p1"),
        ).resolves.toBeUndefined();
    });

    it("encodes hostile ids so they cannot add extra filters", async () => {
        dataApiMock.mockResolvedValueOnce(undefined);

        await removeWishlistItem("u1", "p1&userId=neq.u1");

        const { query } = lastCallOptions();
        expect(query?.get("productId")).toBe("eq.p1&userId=neq.u1");
        expect(query?.getAll("userId")).toEqual(["eq.u1"]);
    });

    it("propagates errors from the data API", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("forbidden"));
        await expect(removeWishlistItem("user-1", "p1")).rejects.toThrow(
            "forbidden",
        );
    });
});
