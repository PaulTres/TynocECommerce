import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    headers: vi.fn(),
    extractNeonAuthCookies: vi.fn(),
    createReadOnlyAuth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@neondatabase/auth/server", () => ({
    extractNeonAuthCookies: mocks.extractNeonAuthCookies,
}));
vi.mock("@/lib/auth/server", () => ({
    createReadOnlyAuth: mocks.createReadOnlyAuth,
}));

import { getRequestAuth } from "./request";

type Context = {
    getCookies: () => string;
    setCookie: (...args: unknown[]) => void;
    getHeader: (name: string) => string | null;
    getOrigin: () => string;
    getFramework: () => string;
};

const AUTH_SENTINEL = { kind: "read-only-auth" };

/**
 * Runs getRequestAuth with the given request headers and returns the context
 * built by the factory that was handed to createReadOnlyAuth.
 */
async function buildContext(
    init: Record<string, string> = {},
): Promise<Context> {
    mocks.headers.mockResolvedValue(new Headers(init));
    await getRequestAuth();
    const factory = mocks.createReadOnlyAuth.mock.calls.at(
        -1,
    )?.[0] as () => Context;
    return factory();
}

beforeEach(() => {
    mocks.headers.mockReset();
    mocks.extractNeonAuthCookies.mockReset();
    mocks.createReadOnlyAuth.mockReset();

    mocks.extractNeonAuthCookies.mockReturnValue("neon-session=abc");
    mocks.createReadOnlyAuth.mockReturnValue(AUTH_SENTINEL);
});

describe("getRequestAuth", () => {
    it("returns null and builds no client when there are no Neon cookies", async () => {
        mocks.headers.mockResolvedValue(new Headers());
        mocks.extractNeonAuthCookies.mockReturnValue("");

        await expect(getRequestAuth()).resolves.toBeNull();
        expect(mocks.createReadOnlyAuth).not.toHaveBeenCalled();
    });

    it("also returns null when the extractor yields null/undefined", async () => {
        mocks.headers.mockResolvedValue(new Headers());
        mocks.extractNeonAuthCookies.mockReturnValue(null);

        await expect(getRequestAuth()).resolves.toBeNull();
    });

    it("passes the incoming request headers to the cookie extractor", async () => {
        const requestHeaders = new Headers({ cookie: "a=b" });
        mocks.headers.mockResolvedValue(requestHeaders);

        await getRequestAuth();

        expect(mocks.extractNeonAuthCookies).toHaveBeenCalledWith(
            requestHeaders,
        );
    });

    it("returns the client created by createReadOnlyAuth", async () => {
        mocks.headers.mockResolvedValue(new Headers());

        await expect(getRequestAuth()).resolves.toBe(AUTH_SENTINEL);
        expect(mocks.createReadOnlyAuth).toHaveBeenCalledTimes(1);
        expect(mocks.createReadOnlyAuth).toHaveBeenCalledWith(
            expect.any(Function),
        );
    });
});

describe("getRequestAuth - request context", () => {
    it("getCookies returns the extracted Neon cookie header", async () => {
        const context = await buildContext();
        expect(context.getCookies()).toBe("neon-session=abc");
    });

    it("setCookie is a harmless no-op", async () => {
        const context = await buildContext();
        expect(() => context.setCookie("name", "value", {})).not.toThrow();
        expect(context.setCookie("name", "value")).toBeUndefined();
    });

    it("getHeader reads from the request headers (case-insensitive)", async () => {
        const context = await buildContext({ "x-custom": "yes" });
        expect(context.getHeader("X-Custom")).toBe("yes");
    });

    it("getHeader returns null for absent headers", async () => {
        const context = await buildContext();
        expect(context.getHeader("x-missing")).toBeNull();
    });

    it("getOrigin prefers the Origin header", async () => {
        const context = await buildContext({
            origin: "https://app.example.com",
            referer: "https://other.example.com/page",
        });
        expect(context.getOrigin()).toBe("https://app.example.com");
    });

    it("getOrigin falls back to the scheme+host of the Referer", async () => {
        const context = await buildContext({
            referer: "https://app.example.com/some/deep/page?x=1",
        });
        expect(context.getOrigin()).toBe("https://app.example.com");
    });

    it("getOrigin returns an empty string when neither header exists", async () => {
        const context = await buildContext();
        expect(context.getOrigin()).toBe("");
    });

    it("getFramework reports nextjs", async () => {
        const context = await buildContext();
        expect(context.getFramework()).toBe("nextjs");
    });
});
