import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/handler", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api/handler")>();
    return {
        ...actual,
        readJson: vi.fn(),
    };
});

vi.mock("@/lib/api/session", () => ({
    requireUserId: vi.fn(),
}));

// Schemas are mocked so these tests don't break when validation rules change.
vi.mock("@/lib/validation/schemas", () => ({
    productIdSchema: { parse: vi.fn() },
    updateCartSchema: { parse: vi.fn() },
}));

vi.mock("@/services/cart.service", () => ({
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    getCart: vi.fn(),
}));

import { readJson } from "@/lib/api/handler";
import { requireUserId } from "@/lib/api/session";
import {
    AppError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "@/lib/errors";
import { productIdSchema, updateCartSchema } from "@/lib/validation/schemas";
import * as cartService from "@/services/cart.service";
import { DELETE, PATCH } from "./route";

const USER_ID = "user-123";
const PRODUCT_ID = "linen-throw-blanket";
const CART = { lines: [], itemCount: 0, subtotalCents: 0, currency: "USD" };

/** Builds the route context. */
const makeCtx = (productId: string = PRODUCT_ID) =>
    ({ params: Promise.resolve({ productId }) }) as never;

/** The body is read via the mocked `readJson`, so the Request content is irrelevant. */
const makeReq = (method: "PATCH" | "DELETE") =>
    new Request(`http://localhost/api/cart/${PRODUCT_ID}`, { method });

const mocked = {
    requireUserId: vi.mocked(requireUserId),
    readJson: vi.mocked(readJson),
    updateCartParse: vi.mocked(updateCartSchema.parse),
    productIdParse: vi.mocked(productIdSchema.parse),
    updateQuantity: vi.mocked(cartService.updateQuantity),
    removeFromCart: vi.mocked(cartService.removeFromCart),
    getCart: vi.mocked(cartService.getCart),
};

beforeEach(() => {
    mocked.requireUserId.mockResolvedValue(USER_ID);
    mocked.readJson.mockResolvedValue({ quantity: 2 });
    mocked.updateCartParse.mockImplementation(
        (input: unknown) => input as never,
    );
    mocked.productIdParse.mockImplementation((id: unknown) => id as never);
    mocked.updateQuantity.mockResolvedValue(undefined as never);
    mocked.removeFromCart.mockResolvedValue(undefined as never);
    mocked.getCart.mockResolvedValue(CART as never);
});

describe("PATCH /api/cart/:productId", () => {
    it("updates the quantity and returns the refreshed cart with status 200", async () => {
        const res = await PATCH(makeReq("PATCH"), makeCtx());

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(CART);
        expect(mocked.updateQuantity).toHaveBeenCalledWith(
            USER_ID,
            PRODUCT_ID,
            2,
        );
        expect(mocked.getCart).toHaveBeenCalledWith(USER_ID);
    });

    it("validates the body merged with the productId from the URL", async () => {
        mocked.readJson.mockResolvedValue({ quantity: 5 });

        await PATCH(makeReq("PATCH"), makeCtx());

        expect(mocked.updateCartParse).toHaveBeenCalledWith({
            quantity: 5,
            productId: PRODUCT_ID,
        });
    });

    it("lets the URL productId win over a productId smuggled in the body", async () => {
        mocked.readJson.mockResolvedValue({
            quantity: 1,
            productId: "some-other-product",
        });

        await PATCH(makeReq("PATCH"), makeCtx());

        expect(mocked.updateCartParse).toHaveBeenCalledWith({
            quantity: 1,
            productId: PRODUCT_ID,
        });
    });

    it("passes the parsed values (not the raw ones) to the service", async () => {
        mocked.readJson.mockResolvedValue({ quantity: "3" });
        mocked.updateCartParse.mockReturnValue({
            productId: "normalized-id",
            quantity: 3,
        } as never);

        await PATCH(makeReq("PATCH"), makeCtx());

        expect(mocked.updateQuantity).toHaveBeenCalledWith(
            USER_ID,
            "normalized-id",
            3,
        );
    });

    it("forwards quantity 0 to the service (treated as a removal)", async () => {
        //guards against checks such as `if (input.quantity)`.
        mocked.readJson.mockResolvedValue({ quantity: 0 });

        await PATCH(makeReq("PATCH"), makeCtx());

        expect(mocked.updateQuantity).toHaveBeenCalledWith(
            USER_ID,
            PRODUCT_ID,
            0,
        );
    });

    it("scopes the operation to the session user", async () => {
        mocked.requireUserId.mockResolvedValue("another-user");

        await PATCH(makeReq("PATCH"), makeCtx());

        expect(mocked.updateQuantity).toHaveBeenCalledWith(
            "another-user",
            PRODUCT_ID,
            2,
        );
        expect(mocked.getCart).toHaveBeenCalledWith("another-user");
    });

    it("reads the cart only after the mutation completed", async () => {
        await PATCH(makeReq("PATCH"), makeCtx());

        expect(mocked.updateQuantity.mock.invocationCallOrder[0]).toBeLessThan(
            mocked.getCart.mock.invocationCallOrder[0],
        );
    });

    it("awaits the async route params", async () => {
        await PATCH(makeReq("PATCH"), makeCtx("woven-basket"));

        expect(mocked.updateCartParse).toHaveBeenCalledWith(
            expect.objectContaining({ productId: "woven-basket" }),
        );
    });

    it("rejects without touching the body or service when unauthenticated", async () => {
        mocked.requireUserId.mockRejectedValue(new UnauthorizedError());

        const response = await PATCH(makeReq("PATCH"), makeCtx());
        expect(response.status).toBe(401);
        // Auth must be the first gate: no body parsing, validation or DB work.
        expect(mocked.readJson).not.toHaveBeenCalled();
        expect(mocked.updateCartParse).not.toHaveBeenCalled();
        expect(mocked.updateQuantity).not.toHaveBeenCalled();
        expect(mocked.getCart).not.toHaveBeenCalled();
    });

    it("propagates a malformed-JSON response from readJson", async () => {
        mocked.readJson.mockRejectedValue(new ValidationError());

        const response = await PATCH(makeReq("PATCH"), makeCtx());
        expect(response.status).toBe(400);
        expect(mocked.updateQuantity).not.toHaveBeenCalled();
    });

    it("does not call the service when validation fails", async () => {
        mocked.updateCartParse.mockImplementation(() => {
            throw new ValidationError();
        });

        const response = await PATCH(makeReq("PATCH"), makeCtx());
        expect(response.status).toBe(400);
        expect(mocked.updateQuantity).not.toHaveBeenCalled();
        expect(mocked.getCart).not.toHaveBeenCalled();
    });

    it("propagates service errors and does not fetch the cart", async () => {
        mocked.updateQuantity.mockRejectedValue(new NotFoundError());

        const response = await PATCH(makeReq("PATCH"), makeCtx());
        expect(response.status).toBe(404);
        expect(mocked.getCart).not.toHaveBeenCalled();
    });

    it("propagates errors thrown while reloading the cart", async () => {
        mocked.getCart.mockRejectedValue(
            new AppError("DB unavailable", 500, "boom"),
        );

        const response = await PATCH(makeReq("PATCH"), makeCtx());
        expect(response.status).toBe(500);
    });
});

describe("DELETE /api/cart/:productId", () => {
    it("removes the line and returns the refreshed cart with status 200", async () => {
        const res = await DELETE(makeReq("DELETE"), makeCtx());

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(CART);
        expect(mocked.removeFromCart).toHaveBeenCalledWith(USER_ID, PRODUCT_ID);
        expect(mocked.getCart).toHaveBeenCalledWith(USER_ID);
    });

    it("validates the URL productId and passes the parsed value to the service", async () => {
        mocked.productIdParse.mockReturnValue("normalized-id" as never);

        await DELETE(makeReq("DELETE"), makeCtx("  Raw-Id "));

        expect(mocked.productIdParse).toHaveBeenCalledWith("  Raw-Id ");
        expect(mocked.removeFromCart).toHaveBeenCalledWith(
            USER_ID,
            "normalized-id",
        );
    });

    it("does not read a request body", async () => {
        await DELETE(makeReq("DELETE"), makeCtx());

        expect(mocked.readJson).not.toHaveBeenCalled();
    });

    it("scopes the removal to the session user", async () => {
        mocked.requireUserId.mockResolvedValue("another-user");

        await DELETE(makeReq("DELETE"), makeCtx());

        expect(mocked.removeFromCart).toHaveBeenCalledWith(
            "another-user",
            PRODUCT_ID,
        );
        expect(mocked.getCart).toHaveBeenCalledWith("another-user");
    });

    it("reads the cart only after the removal completed", async () => {
        await DELETE(makeReq("DELETE"), makeCtx());

        expect(mocked.removeFromCart.mock.invocationCallOrder[0]).toBeLessThan(
            mocked.getCart.mock.invocationCallOrder[0],
        );
    });

    it("rejects without validating or mutating when unauthenticated", async () => {
        mocked.requireUserId.mockRejectedValue(new UnauthorizedError());

        const response = await DELETE(makeReq("DELETE"), makeCtx());
        expect(response.status).toBe(401);
        expect(mocked.productIdParse).not.toHaveBeenCalled();
        expect(mocked.removeFromCart).not.toHaveBeenCalled();
        expect(mocked.getCart).not.toHaveBeenCalled();
    });

    it("does not call the service when the productId is invalid", async () => {
        mocked.productIdParse.mockImplementation(() => {
            throw new ValidationError();
        });

        const response = await DELETE(makeReq("DELETE"), makeCtx("!!!"));
        expect(response.status).toBe(400);
        expect(mocked.removeFromCart).not.toHaveBeenCalled();
        expect(mocked.getCart).not.toHaveBeenCalled();
    });

    it("propagates service errors and does not fetch the cart", async () => {
        mocked.removeFromCart.mockRejectedValue(
            new AppError("DB unavailable", 500, "boom"),
        );

        const response = await DELETE(makeReq("DELETE"), makeCtx());
        expect(response.status).toBe(500);
        expect(mocked.getCart).not.toHaveBeenCalled();
    });

    it("propagates errors thrown while reloading the cart as json responses", async () => {
        mocked.getCart.mockRejectedValue(
            new AppError("DB unavailable", 500, "boom"),
        );

        const response = await DELETE(makeReq("DELETE"), makeCtx());
        expect(response.status).toBe(500);
    });
});
