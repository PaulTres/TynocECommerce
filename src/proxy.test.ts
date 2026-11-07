import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const middleware = vi.fn();
    return {
        middleware,
        authMiddleware: vi.fn((options: { loginUrl: string }) => {
            void options;
            return middleware;
        }),
    };
});
vi.mock("@/lib/auth/server", () => ({
    auth: { middleware: mocks.authMiddleware },
}));

import proxy, { config } from "./proxy";

const middlewareOptions = mocks.authMiddleware.mock.calls[0]?.[0];

describe("request proxy", () => {
    it("exports the auth middleware configured with the login destination", () => {
        expect(middlewareOptions).toEqual({ loginUrl: "/login" });
        expect(proxy).toBe(mocks.middleware);
    });

    it("limits proxy execution to cart and wishlist routes", () => {
        expect(config.matcher).toEqual(["/cart/:path*", "/wishlist/:path*"]);
    });
});
