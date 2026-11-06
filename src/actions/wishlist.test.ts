import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToWishlistAction, removeFromWishlistAction } from "./wishlist";

const mocks = vi.hoisted(() => ({
    runAction: vi.fn(),
    requireUserId: vi.fn(),
    parseProductId: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    revalidatePath: vi.fn(),
}));

vi.mock("@/lib/api/action", () => ({ runAction: mocks.runAction }));
vi.mock("@/lib/api/session", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/validation/schemas", () => ({
    productIdSchema: { parse: mocks.parseProductId },
}));
vi.mock("@/services/wishlist.service", () => ({
    addToWishlist: mocks.addToWishlist,
    removeFromWishlist: mocks.removeFromWishlist,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const USER_ID = "user-123";
const RAW_PRODUCT_ID = "  raw-input  ";
const PARSED_PRODUCT_ID = "product-456";

/**Table definition so both actions are verified against the exact same contract.*/
const actions = [
    {
        name: "addToWishlistAction",
        action: addToWishlistAction,
        service: mocks.addToWishlist,
    },
    {
        name: "removeFromWishlistAction",
        action: removeFromWishlistAction,
        service: mocks.removeFromWishlist,
    },
] as const;

beforeEach(() => {
    vi.clearAllMocks();

    mocks.runAction.mockImplementation(async (fn: () => Promise<unknown>) => {
        try {
            await fn();
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "unknown",
            };
        }
    });

    mocks.requireUserId.mockResolvedValue(USER_ID);
    mocks.parseProductId.mockReturnValue(PARSED_PRODUCT_ID);
    mocks.addToWishlist.mockResolvedValue(undefined);
    mocks.removeFromWishlist.mockResolvedValue(undefined);
});

describe.each(actions)("$name", ({ action, service }) => {
    describe("happy path", () => {
        it("delegates execution to runAction exactly once", async () => {
            await action(RAW_PRODUCT_ID);

            expect(mocks.runAction).toHaveBeenCalledTimes(1);
            expect(mocks.runAction).toHaveBeenCalledWith(expect.any(Function));
        });

        it("returns whatever runAction returns (no result tampering)", async () => {
            //Symbol is guaranteed to return a unique value
            const sentinel = { success: true, marker: Symbol("sentinel") };
            mocks.runAction.mockResolvedValueOnce(sentinel);

            await expect(action(RAW_PRODUCT_ID)).resolves.toBe(sentinel);
        });

        it("calls the service with the session user id and the validated product id", async () => {
            await action(RAW_PRODUCT_ID);

            expect(mocks.parseProductId).toHaveBeenCalledWith(RAW_PRODUCT_ID);
            expect(service).toHaveBeenCalledTimes(1);
            expect(service).toHaveBeenCalledWith(USER_ID, PARSED_PRODUCT_ID);
            expect(service).not.toHaveBeenCalledWith(USER_ID, RAW_PRODUCT_ID);
        });

        it("revalidates the /wishlist path exactly once after the mutation", async () => {
            await action(RAW_PRODUCT_ID);

            expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
            expect(mocks.revalidatePath).toHaveBeenCalledWith("/wishlist");
        });

        it("revalidates only after the service call succeeded (no stale-cache race)", async () => {
            // Record call order across mocks to make sure the cache is never
            // invalidated before the data has actually changed.
            const order: string[] = [];
            service.mockImplementationOnce(async () => {
                order.push("service");
            });
            mocks.revalidatePath.mockImplementationOnce(() => {
                order.push("revalidate");
            });

            await action(RAW_PRODUCT_ID);

            expect(order).toEqual(["service", "revalidate"]);
        });

        it("returns a success result", async () => {
            await expect(action(RAW_PRODUCT_ID)).resolves.toEqual({
                success: true,
            });
        });
    });

    describe("authentication", () => {
        it("derives the user id from the session, never from client input", async () => {
            mocks.requireUserId.mockResolvedValueOnce("session-user");

            await action(RAW_PRODUCT_ID);

            expect(mocks.requireUserId).toHaveBeenCalledTimes(1);
            expect(service).toHaveBeenCalledWith(
                "session-user",
                PARSED_PRODUCT_ID,
            );
        });

        it("does not touch the service or cache when the user is unauthenticated", async () => {
            mocks.requireUserId.mockRejectedValueOnce(
                new Error("Unauthorized"),
            );

            const result = await action(RAW_PRODUCT_ID);

            expect(result).toEqual({ success: false, error: "Unauthorized" });
            expect(service).not.toHaveBeenCalled();
            expect(mocks.revalidatePath).not.toHaveBeenCalled();
        });

        it("authenticates before validating input", async () => {
            mocks.requireUserId.mockRejectedValueOnce(
                new Error("Unauthorized"),
            );

            await action(RAW_PRODUCT_ID);

            expect(mocks.parseProductId).not.toHaveBeenCalled();
        });
    });

    describe("input validation", () => {
        it.each([
            ["undefined", undefined],
            ["null", null],
            ["an empty string", ""],
            ["a number", 42],
            ["an object", { id: "1" }],
            ["an array", ["1"]],
        ])("rejects %s without calling the service", async (_label, input) => {
            mocks.parseProductId.mockImplementationOnce(() => {
                throw new Error("Invalid product id");
            });

            const result = await action(input);

            expect(mocks.parseProductId).toHaveBeenCalledWith(input);
            expect(result).toEqual({
                success: false,
                error: "Invalid product id",
            });
            expect(service).not.toHaveBeenCalled();
            expect(mocks.revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("service failures", () => {
        it("surfaces service errors through runAction and skips revalidation", async () => {
            service.mockRejectedValueOnce(new Error("DB unavailable"));

            const result = await action(RAW_PRODUCT_ID);

            expect(result).toEqual({
                success: false,
                error: "DB unavailable",
            });
            // A failed mutation must not trigger a cache purge.
            expect(mocks.revalidatePath).not.toHaveBeenCalled();
        });

        it("does not throw out of the action (errors are contained by runAction)", async () => {
            service.mockRejectedValueOnce(new Error("boom"));

            await expect(action(RAW_PRODUCT_ID)).resolves.toBeDefined();
        });

        it("propagates revalidatePath failures to runAction", async () => {
            mocks.revalidatePath.mockImplementationOnce(() => {
                throw new Error("revalidate failed");
            });

            const result = await action(RAW_PRODUCT_ID);

            expect(result).toEqual({
                success: false,
                error: "revalidate failed",
            });
        });
    });
});

describe("action isolation", () => {
    it("addToWishlistAction never calls removeFromWishlist", async () => {
        await addToWishlistAction(RAW_PRODUCT_ID);

        expect(mocks.addToWishlist).toHaveBeenCalledTimes(1);
        expect(mocks.removeFromWishlist).not.toHaveBeenCalled();
    });

    it("removeFromWishlistAction never calls addToWishlist", async () => {
        await removeFromWishlistAction(RAW_PRODUCT_ID);

        expect(mocks.removeFromWishlist).toHaveBeenCalledTimes(1);
        expect(mocks.addToWishlist).not.toHaveBeenCalled();
    });
});
