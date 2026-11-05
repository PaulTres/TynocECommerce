import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError } from "@/lib/errors";
import {
    incrementItem,
    listCartItems,
    removeItem,
    setQuantity,
    sumCartQuantities,
} from "./cart.repo";
import { dataApi } from "./data-api";

vi.mock("./data-api", () => ({ dataApi: vi.fn() }));

const dataApiMock = vi.mocked(dataApi);

function optionsOf(callIndex = 0) {
    return dataApiMock.mock.calls[callIndex][1] as {
        access?: string;
        method?: string;
        query?: URLSearchParams;
        body?: Record<string, unknown>;
        prefer?: string;
    };
}

const USER_ID = "user-123";
const PRODUCT_ID = "prod-456";

beforeEach(() => {
    // Reset call history and queued return values.
    dataApiMock.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("listCartItems", () => {
    it("queries the CartItem table with the correct filter, projection and ordering", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await listCartItems(USER_ID);

        expect(dataApiMock).toHaveBeenCalledTimes(1);
        expect(dataApiMock.mock.calls[0][0]).toBe("CartItem");

        const opts = optionsOf();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBeUndefined();
        expect(opts.query?.get("select")).toBe(
            "productId,quantity,addedAt,updatedAt",
        );
        expect(opts.query?.get("userId")).toBe(`eq.${USER_ID}`);
        expect(opts.query?.get("order")).toBe("addedAt.asc");
    });

    it("maps rows to CartItemRecord and normalises timestamps to ISO strings", async () => {
        dataApiMock.mockResolvedValueOnce([
            {
                productId: "p1",
                quantity: 2,
                addedAt: "2024-01-01T10:00:00+02:00", // offset string -> converted to UTC
                updatedAt: "2024-01-02T00:00:00.000Z",
            },
        ]);

        const result = await listCartItems(USER_ID);

        expect(result).toEqual([
            {
                productId: "p1",
                quantity: 2,
                addedAt: "2024-01-01T08:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
            },
        ]);
    });

    it("accepts Date instances as well as strings for timestamps", async () => {
        const added = new Date("2024-03-05T12:34:56.789Z");
        dataApiMock.mockResolvedValueOnce([
            { productId: "p1", quantity: 1, addedAt: added, updatedAt: added },
        ]);

        const [item] = await listCartItems(USER_ID);

        expect(item.addedAt).toBe("2024-03-05T12:34:56.789Z");
        expect(item.updatedAt).toBe("2024-03-05T12:34:56.789Z");
    });

    it("coerces loosely typed values (numeric ids, string quantities) to the declared types", async () => {
        dataApiMock.mockResolvedValueOnce([
            {
                productId: 42,
                quantity: "3",
                addedAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-01T00:00:00Z",
            },
        ]);

        const [item] = await listCartItems(USER_ID);

        expect(item.productId).toBe("42");
        expect(item.quantity).toBe(3);
        expect(typeof item.quantity).toBe("number");
    });

    it("preserves the order returned by the API (ordering is the database's job)", async () => {
        dataApiMock.mockResolvedValueOnce([
            {
                productId: "a",
                quantity: 1,
                addedAt: "2024-01-01T00:00:00Z",
                updatedAt: "2024-01-01T00:00:00Z",
            },
            {
                productId: "b",
                quantity: 1,
                addedAt: "2024-01-02T00:00:00Z",
                updatedAt: "2024-01-02T00:00:00Z",
            },
        ]);

        const result = await listCartItems(USER_ID);

        expect(result.map((r) => r.productId)).toEqual(["a", "b"]);
    });

    it("returns an empty array for an empty cart", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await expect(listCartItems(USER_ID)).resolves.toEqual([]);
    });

    it("URL-encodes hostile user ids so they cannot inject extra query parameters", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await listCartItems("abc&admin=1");

        const query = optionsOf().query!;
        expect(query.get("userId")).toBe("eq.abc&admin=1");
        expect(query.has("admin")).toBe(false);
    });

    it("propagates errors from the data layer unchanged", async () => {
        const boom = new Error("network down");
        dataApiMock.mockRejectedValueOnce(boom);

        await expect(listCartItems(USER_ID)).rejects.toBe(boom);
    });

    it("throws a RangeError when the database returns an unparseable timestamp", async () => {
        dataApiMock.mockResolvedValueOnce([
            {
                productId: "p1",
                quantity: 1,
                addedAt: "not-a-date",
                updatedAt: "2024-01-01T00:00:00Z",
            },
        ]);

        await expect(listCartItems(USER_ID)).rejects.toBeInstanceOf(RangeError);
    });
});

describe("sumCartQuantities", () => {
    it("selects only the quantity column for the given user", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await sumCartQuantities(USER_ID);

        expect(dataApiMock.mock.calls[0][0]).toBe("CartItem");
        const opts = optionsOf();
        expect(opts.access).toBe("authenticated");
        expect(opts.query?.get("select")).toBe("quantity");
        expect(opts.query?.get("userId")).toBe(`eq.${USER_ID}`);
    });

    it("sums quantities across all lines", async () => {
        dataApiMock.mockResolvedValueOnce([
            { quantity: 2 },
            { quantity: 5 },
            { quantity: 1 },
        ]);

        await expect(sumCartQuantities(USER_ID)).resolves.toBe(8);
    });

    it("returns 0 for an empty cart", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await expect(sumCartQuantities(USER_ID)).resolves.toBe(0);
    });

    it("coerces string quantities instead of concatenating them", async () => {
        dataApiMock.mockResolvedValueOnce([
            { quantity: "2" as unknown as number },
            { quantity: "3" as unknown as number },
        ]);

        await expect(sumCartQuantities(USER_ID)).resolves.toBe(5);
    });

    it("propagates errors from the data layer", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("timeout"));

        await expect(sumCartQuantities(USER_ID)).rejects.toThrow("timeout");
    });
});

describe("incrementItem", () => {
    it("calls the increment_cart_item RPC with the expected POST payload", async () => {
        dataApiMock.mockResolvedValueOnce(3);

        await incrementItem(USER_ID, PRODUCT_ID, 2, 10);

        expect(dataApiMock.mock.calls[0][0]).toBe("rpc/increment_cart_item");
        const opts = optionsOf();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBe("POST");
        expect(opts.body).toEqual({
            p_user_id: USER_ID,
            p_product_id: PRODUCT_ID,
            p_qty: 2,
            p_cap: 10,
        });
    });

    it("returns the new total quantity as a number", async () => {
        dataApiMock.mockResolvedValueOnce("7" as unknown as number); // scalar RPCs may arrive as strings

        const result = await incrementItem(USER_ID, PRODUCT_ID, 2, 10);

        expect(result).toBe(7);
        expect(typeof result).toBe("number");
    });

    it("fails fast with ConflictError, without hitting the database, when qty exceeds the cap", async () => {
        const promise = incrementItem(USER_ID, PRODUCT_ID, 11, 10);

        await expect(promise).rejects.toBeInstanceOf(ConflictError);
        await expect(promise).rejects.toThrow(
            "You can add at most 10 of this item",
        );
        //the pre-check must save a network round trip
        expect(dataApiMock).not.toHaveBeenCalled();
    });

    it("allows qty exactly equal to the cap (boundary)", async () => {
        dataApiMock.mockResolvedValueOnce(10);

        await expect(incrementItem(USER_ID, PRODUCT_ID, 10, 10)).resolves.toBe(
            10,
        );
        expect(dataApiMock).toHaveBeenCalledTimes(1);
    });

    it("throws ConflictError when the RPC returns null (cap would be exceeded in the cart)", async () => {
        // The RPC returns NULL when existing quantity + qty > cap. This is the
        // concurrency-safe check; the pre-check above only catches the trivial case.
        dataApiMock.mockResolvedValueOnce(null);

        const promise = incrementItem(USER_ID, PRODUCT_ID, 2, 10);

        await expect(promise).rejects.toBeInstanceOf(ConflictError);
        await expect(promise).rejects.toThrow(
            "You can have at most 10 of this item in your cart",
        );
    });

    it("does not treat a quantity of 0 as a cap violation (only null is)", async () => {
        dataApiMock.mockResolvedValueOnce(0);

        await expect(incrementItem(USER_ID, PRODUCT_ID, 1, 10)).resolves.toBe(
            0,
        );
    });

    it("propagates unexpected data-layer errors without wrapping them", async () => {
        const boom = new Error("rpc failed");
        dataApiMock.mockRejectedValueOnce(boom);

        await expect(incrementItem(USER_ID, PRODUCT_ID, 1, 10)).rejects.toBe(
            boom,
        );
    });

    it.each([
        ["zero", 0],
        ["a negative number", -1],
        ["a large negative number", -9999],
        ["a decimal", 1.5],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["-Infinity", Number.NEGATIVE_INFINITY],
    ])(
        "rejects qty that is %s with a ConflictError and never calls the database",
        async (_label, qty) => {
            await expect(
                incrementItem(USER_ID, PRODUCT_ID, qty, 10),
            ).rejects.toBeInstanceOf(ConflictError);
            // Validation must happen client-side of the RPC.
            expect(dataApiMock).not.toHaveBeenCalled();
        },
    );

    it("accepts the smallest valid quantity (1)", async () => {
        dataApiMock.mockResolvedValueOnce(1);

        await expect(incrementItem(USER_ID, PRODUCT_ID, 1, 10)).resolves.toBe(
            1,
        );
        expect(optionsOf().body).toMatchObject({ p_qty: 1 });
    });
});

describe("setQuantity", () => {
    it("Patches the matching row scoped by both userId and productId", async () => {
        // Freeze time so the updatedAt assertion is exact rather than approximate.
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-06-01T12:00:00.000Z"));
        dataApiMock.mockResolvedValueOnce([{ productId: PRODUCT_ID }]);

        await setQuantity(USER_ID, PRODUCT_ID, 4);

        expect(dataApiMock.mock.calls[0][0]).toBe("CartItem");
        const opts = optionsOf();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBe("PATCH");
        expect(opts.query?.get("userId")).toBe(`eq.${USER_ID}`);
        expect(opts.query?.get("productId")).toBe(`eq.${PRODUCT_ID}`);
        expect(opts.query?.get("select")).toBe("productId");
        expect(opts.body).toEqual({
            quantity: 4,
            updatedAt: "2024-06-01T12:00:00.000Z",
        });
        expect(opts.prefer).toBe("return=representation");
    });

    it("resolves with undefined when the row was updated", async () => {
        dataApiMock.mockResolvedValueOnce([{ productId: PRODUCT_ID }]);

        await expect(
            setQuantity(USER_ID, PRODUCT_ID, 1),
        ).resolves.toBeUndefined();
    });

    it("throws NotFoundError when no row matched the filter", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        const promise = setQuantity(USER_ID, PRODUCT_ID, 1);

        await expect(promise).rejects.toBeInstanceOf(NotFoundError);
        await expect(promise).rejects.toThrow("That item is not in your cart");
    });

    it("propagates data-layer errors", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("db unavailable"));

        await expect(setQuantity(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(
            "db unavailable",
        );
    });

    it("encodes hostile product ids as a single filter value", async () => {
        dataApiMock.mockResolvedValueOnce([{ productId: "x" }]);

        await setQuantity(USER_ID, "p&userId=eq.other", 1);

        const query = optionsOf().query!;
        expect(query.getAll("userId")).toEqual([`eq.${USER_ID}`]);
        expect(query.get("productId")).toBe("eq.p&userId=eq.other");
    });

    it.each([
        ["a negative number", -1],
        ["a large negative number", -9999],
        ["a decimal", 2.5],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["-Infinity", Number.NEGATIVE_INFINITY],
    ])(
        "rejects quantity that is %s with a ConflictError and never calls the database",
        async (_label, quantity) => {
            await expect(
                setQuantity(USER_ID, PRODUCT_ID, quantity),
            ).rejects.toBeInstanceOf(ConflictError);
            // A rejected value must never reach the PATCH, otherwise the bad quantity is persisted.
            expect(dataApiMock).not.toHaveBeenCalled();
        },
    );

    it("still reports NotFoundError (not ConflictError) for a valid quantity on a missing row", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        const promise = setQuantity(USER_ID, PRODUCT_ID, 3);

        await expect(promise).rejects.toBeInstanceOf(NotFoundError);
        await expect(promise).rejects.not.toBeInstanceOf(ConflictError);
    });

    it("accepts the smallest valid quantity (1)", async () => {
        dataApiMock.mockResolvedValueOnce([{ productId: PRODUCT_ID }]);

        await expect(
            setQuantity(USER_ID, PRODUCT_ID, 1),
        ).resolves.toBeUndefined();
        expect(optionsOf().body).toMatchObject({ quantity: 1 });
    });
});

describe("removeItem", () => {
    it("Deletes the row scoped by both userId and productId", async () => {
        dataApiMock.mockResolvedValueOnce(undefined);

        await removeItem(USER_ID, PRODUCT_ID);

        expect(dataApiMock.mock.calls[0][0]).toBe("CartItem");
        const opts = optionsOf();
        expect(opts.access).toBe("authenticated");
        expect(opts.method).toBe("DELETE");
        expect(opts.query?.get("userId")).toBe(`eq.${USER_ID}`);
        expect(opts.query?.get("productId")).toBe(`eq.${PRODUCT_ID}`);
    });

    it("is idempotent: resolves even if nothing was deleted", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await expect(removeItem(USER_ID, PRODUCT_ID)).resolves.toBeUndefined();
    });

    it("propagates data-layer errors", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("forbidden"));

        await expect(removeItem(USER_ID, PRODUCT_ID)).rejects.toThrow(
            "forbidden",
        );
    });
});
