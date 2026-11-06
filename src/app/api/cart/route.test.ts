import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireUserId: vi.fn(),
    readJson: vi.fn(),
    parse: vi.fn(),
    getCart: vi.fn(),
    addToCart: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
    withErrors: <T extends (...args: any[]) => any>(fn: T) => fn,
    readJson: mocks.readJson,
}));

vi.mock("@/lib/api/session", () => ({
    requireUserId: mocks.requireUserId,
}));

vi.mock("@/lib/validation/schemas", () => ({
    addToCartSchema: { parse: mocks.parse },
}));

vi.mock("@/services/cart.service", () => ({
    getCart: mocks.getCart,
    addToCart: mocks.addToCart,
}));

import { GET, POST } from "@/app/api/cart/route";

const USER_ID = "user-123";
const CART = { items: [{ productId: "p1", quantity: 2 }], subtotal: 1998 };

const makeRequest = () =>
    new Request("http://localhost/api/cart", { method: "POST", body: "{}" });

beforeEach(() => {
    mocks.requireUserId.mockResolvedValue(USER_ID);
    mocks.readJson.mockResolvedValue({ productId: "p1", quantity: 2 });
    mocks.parse.mockImplementation((input) => input);
    mocks.getCart.mockResolvedValue(CART);
    mocks.addToCart.mockResolvedValue(undefined);
});

describe("GET /api/cart", () => {
    it("returns the signed-in user's cart with 200", async () => {
        const res = await GET();

        expect(mocks.getCart).toHaveBeenCalledWith(USER_ID);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(CART);
    });

    it("marks the response as private and non-cacheable (cart is per-user data)", async () => {
        const res = await GET();

        // Guards against shared caches/CDNs serving one user's cart to another.
        expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    });

    it("propagates the auth error and never touches the service when signed out", async () => {
        const authError = new Error("Unauthorized");
        mocks.requireUserId.mockRejectedValue(authError);

        await expect(GET()).rejects.toBe(authError);
        expect(mocks.getCart).not.toHaveBeenCalled();
    });

    it("propagates service failures", async () => {
        const dbError = new Error("db down");
        mocks.getCart.mockRejectedValue(dbError);

        await expect(GET()).rejects.toBe(dbError);
    });
});

describe("POST /api/cart", () => {
    it("adds the item and responds 201 with the updated cart", async () => {
        const res = await POST(makeRequest());

        expect(mocks.addToCart).toHaveBeenCalledWith(USER_ID, "p1", 2);
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual(CART);
    });

    it("passes the raw request through readJson and its result to the schema", async () => {
        const req = makeRequest();
        const body = { productId: "p9", quantity: 5 };
        mocks.readJson.mockResolvedValue(body);

        await POST(req);

        expect(mocks.readJson).toHaveBeenCalledWith(req);
        expect(mocks.parse).toHaveBeenCalledWith(body);
    });

    it("forwards an undefined quantity so the service/schema default applies", async () => {
        mocks.parse.mockReturnValue({ productId: "p1" });

        await POST(makeRequest());

        expect(mocks.addToCart).toHaveBeenCalledWith(USER_ID, "p1", undefined);
    });

    it("uses the validated (parsed) values, not the raw body", async () => {
        // Simulates a schema that coerces/strips: "3" -> 3, extra fields dropped.
        mocks.readJson.mockResolvedValue({
            productId: "p1",
            quantity: "3",
            isAdmin: true,
        });
        mocks.parse.mockReturnValue({ productId: "p1", quantity: 3 });

        await POST(makeRequest());

        expect(mocks.addToCart).toHaveBeenCalledWith(USER_ID, "p1", 3);
    });

    it("does not read the body or call the service when signed out", async () => {
        mocks.requireUserId.mockRejectedValue(new Error("Unauthorized"));

        await expect(POST(makeRequest())).rejects.toThrow("Unauthorized");

        expect(mocks.readJson).not.toHaveBeenCalled();
        expect(mocks.addToCart).not.toHaveBeenCalled();
    });

    it("rejects invalid input without mutating the cart", async () => {
        const validationError = new Error("Invalid input");
        mocks.parse.mockImplementation(() => {
            throw validationError;
        });

        await expect(POST(makeRequest())).rejects.toBe(validationError);
        expect(mocks.addToCart).not.toHaveBeenCalled();
        expect(mocks.getCart).not.toHaveBeenCalled();
    });

    it("propagates malformed-JSON errors from readJson", async () => {
        const jsonError = new Error("Malformed JSON");
        mocks.readJson.mockRejectedValue(jsonError);

        await expect(POST(makeRequest())).rejects.toBe(jsonError);
        expect(mocks.addToCart).not.toHaveBeenCalled();
    });

    it("propagates addToCart failures and does not fetch the cart afterwards", async () => {
        const serviceError = new Error("Product not found");
        mocks.addToCart.mockRejectedValue(serviceError);

        await expect(POST(makeRequest())).rejects.toBe(serviceError);
        expect(mocks.getCart).not.toHaveBeenCalled();
    });

    it("reads the cart only after the item has been added", async () => {
        await POST(makeRequest());
        const addOrder = mocks.addToCart.mock.invocationCallOrder[0];
        const getOrder = mocks.getCart.mock.invocationCallOrder[0];
        expect(addOrder).toBeLessThan(getOrder);
    });
});
