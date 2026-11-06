import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createNeonAuth: vi.fn(),
    createInternalNeonAuth: vi.fn(),
    createAuthServer: vi.fn(),
}));

vi.mock("@neondatabase/auth", () => ({
    createInternalNeonAuth: mocks.createInternalNeonAuth,
}));
vi.mock("@neondatabase/auth/next/server", () => ({
    createNeonAuth: mocks.createNeonAuth,
}));
vi.mock("@neondatabase/auth/server", () => ({
    createAuthServer: mocks.createAuthServer,
}));

const VALID_URL = "https://auth.example.com";
const VALID_SECRET = "s".repeat(32);

const contextFactory = vi.fn();

const AUTH_SENTINEL = { kind: "managed-auth" };
const ANON_SENTINEL = { kind: "anonymous-auth" };
const SERVER_SENTINEL = { kind: "auth-server" };

const originalEnv = {
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
};

/** The module validates env vars and builds clients at import time, so each test must re-import it.*/
async function loadModule() {
    vi.resetModules();
    return import("./server");
}

beforeEach(() => {
    mocks.createNeonAuth.mockReset();
    mocks.createInternalNeonAuth.mockReset();
    mocks.createAuthServer.mockReset();

    mocks.createNeonAuth.mockReturnValue(AUTH_SENTINEL);
    mocks.createInternalNeonAuth.mockReturnValue(ANON_SENTINEL);
    mocks.createAuthServer.mockReturnValue(SERVER_SENTINEL);

    process.env.NEON_AUTH_BASE_URL = VALID_URL;
    process.env.NEON_AUTH_COOKIE_SECRET = VALID_SECRET;
});

afterEach(() => {
    //delete any undefined env values
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

describe("server module - environment validation", () => {
    it("throws when NEON_AUTH_BASE_URL is missing", async () => {
        delete process.env.NEON_AUTH_BASE_URL;
        await expect(loadModule()).rejects.toThrow(
            "NEON_AUTH_BASE_URL is required",
        );
    });

    it("throws when NEON_AUTH_BASE_URL is an empty string", async () => {
        process.env.NEON_AUTH_BASE_URL = "";
        await expect(loadModule()).rejects.toThrow(
            "NEON_AUTH_BASE_URL is required",
        );
    });

    it("throws when NEON_AUTH_COOKIE_SECRET is missing", async () => {
        delete process.env.NEON_AUTH_COOKIE_SECRET;
        await expect(loadModule()).rejects.toThrow(
            "NEON_AUTH_COOKIE_SECRET must be at least 32 characters",
        );
    });

    it("throws when the cookie secret is shorter than 32 characters", async () => {
        process.env.NEON_AUTH_COOKIE_SECRET = "x".repeat(31);
        await expect(loadModule()).rejects.toThrow(
            "NEON_AUTH_COOKIE_SECRET must be at least 32 characters",
        );
    });

    it("accepts a cookie secret of exactly 32 characters", async () => {
        process.env.NEON_AUTH_COOKIE_SECRET = "x".repeat(32);
        await expect(loadModule()).resolves.toBeDefined();
    });

    it("does not construct any client when validation fails", async () => {
        delete process.env.NEON_AUTH_BASE_URL;
        await loadModule().catch(() => undefined);

        expect(mocks.createNeonAuth).not.toHaveBeenCalled();
        expect(mocks.createInternalNeonAuth).not.toHaveBeenCalled();
    });
});

describe("server module - exports", () => {
    it("builds `auth` with the base URL and cookie secret", async () => {
        const { auth } = await loadModule();

        expect(mocks.createNeonAuth).toHaveBeenCalledTimes(1);
        expect(mocks.createNeonAuth).toHaveBeenCalledWith({
            baseUrl: VALID_URL,
            cookies: { secret: VALID_SECRET },
        });
        expect(auth).toBe(AUTH_SENTINEL);
    });

    it("builds `anonymousAuth` with anonymous access enabled", async () => {
        const { anonymousAuth } = await loadModule();

        expect(mocks.createInternalNeonAuth).toHaveBeenCalledTimes(1);
        expect(mocks.createInternalNeonAuth).toHaveBeenCalledWith(VALID_URL, {
            allowAnonymous: true,
        });
        expect(anonymousAuth).toBe(ANON_SENTINEL);
    });
});

describe("createReadOnlyAuth", () => {
    it("creates an auth server with config plus the supplied context", async () => {
        const { createReadOnlyAuth } = await loadModule();

        const result = createReadOnlyAuth(contextFactory);

        expect(mocks.createAuthServer).toHaveBeenCalledTimes(1);
        expect(mocks.createAuthServer).toHaveBeenCalledWith({
            baseUrl: VALID_URL,
            cookieSecret: VALID_SECRET,
            context: contextFactory,
        });
        expect(result).toBe(SERVER_SENTINEL);
    });

    it("creates a new auth server on every call (no shared state)", async () => {
        const { createReadOnlyAuth } = await loadModule();

        createReadOnlyAuth(contextFactory);
        createReadOnlyAuth(contextFactory);

        expect(mocks.createAuthServer).toHaveBeenCalledTimes(2);
    });
});
