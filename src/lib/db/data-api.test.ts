import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    class UnauthorizedError extends Error {
        constructor() {
            super("Unauthorized");
            this.name = "UnauthorizedError";
        }
    }
    return {
        UnauthorizedError,
        getRequestAuth: vi.fn(),
        getJWTToken: vi.fn(),
        requestToken: vi.fn(),
    };
});

vi.mock("react", () => ({
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/errors", () => ({
    UnauthorizedError: mocks.UnauthorizedError,
}));
vi.mock("@/lib/auth/server", () => ({
    anonymousAuth: { getJWTToken: mocks.getJWTToken },
}));
vi.mock("@/lib/auth/request", () => ({
    getRequestAuth: mocks.getRequestAuth,
}));

/** Global fetch spy. */
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { dataApi } from "./data-api";

const BASE_URL = "https://db.example.com/neondb";

function fakeResponse(
    body: string,
    init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
    return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        statusText: init.statusText ?? "OK",
        text: async () => body,
    };
}

/** Returns [url, init] of the most recent fetch call. */
function lastFetchCall(): [string, RequestInit & { headers: Record<string, string> }] {
    const call = fetchMock.mock.calls.at(-1);
    if (!call) throw new Error("fetch was not called");
    return call as [string, RequestInit & { headers: Record<string, string> }];
}

const env = process.env as Record<string, string | undefined>;
const originalEnv = {
    NEON_DATA_API_URL: env.NEON_DATA_API_URL,
    NODE_ENV: env.NODE_ENV,
};

beforeEach(() => {
    // Reset call history and implementations.
    mocks.getRequestAuth.mockReset();
    mocks.getJWTToken.mockReset();
    mocks.requestToken.mockReset();
    fetchMock.mockReset();

    env.NEON_DATA_API_URL = BASE_URL;
    env.NODE_ENV = "test";
    mocks.requestToken.mockResolvedValue({
        data: { token: "user-jwt" },
        error: null,
    });
    mocks.getRequestAuth.mockResolvedValue({ token: mocks.requestToken });
    mocks.getJWTToken.mockResolvedValue("anon-jwt");
    fetchMock.mockResolvedValue(fakeResponse("[]"));
});

afterEach(() => {
    // Restore env exactly (delete keys that were originally unset).
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
    }
});

describe("dataApi - authentication", () => {
    it("uses the session token for authenticated access", async () => {
        await dataApi("todos", { access: "authenticated" });

        expect(mocks.getJWTToken).not.toHaveBeenCalled();
        expect(lastFetchCall()[1].headers.Authorization).toBe("Bearer user-jwt");
    });

    it("uses the anonymous JWT for anonymous access", async () => {
        await dataApi("todos", { access: "anonymous" });

        expect(mocks.getRequestAuth).not.toHaveBeenCalled();
        expect(lastFetchCall()[1].headers.Authorization).toBe("Bearer anon-jwt");
    });

    it("throws UnauthorizedError when there is no request session", async () => {
        mocks.getRequestAuth.mockResolvedValue(null);

        await expect(
            dataApi("todos", { access: "authenticated" }),
        ).rejects.toBeInstanceOf(mocks.UnauthorizedError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedError when the token call returns an error", async () => {
        mocks.requestToken.mockResolvedValue({
            data: null,
            error: new Error("expired"),
        });

        await expect(
            dataApi("todos", { access: "authenticated" }),
        ).rejects.toBeInstanceOf(mocks.UnauthorizedError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedError when the token payload is missing", async () => {
        mocks.requestToken.mockResolvedValue({ data: {}, error: null });

        await expect(
            dataApi("todos", { access: "authenticated" }),
        ).rejects.toBeInstanceOf(mocks.UnauthorizedError);
    });

    it("throws when Neon Auth returns no anonymous token", async () => {
        mocks.getJWTToken.mockResolvedValue(null);

        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "Neon Auth did not return an anonymous Data API token",
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("dataApi - URL construction", () => {
    it("appends /rest/v1 when the configured URL lacks it", async () => {
        await dataApi("todos", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe(
            "https://db.example.com/neondb/rest/v1/todos",
        );
    });

    it("does not duplicate /rest/v1 when already configured", async () => {
        env.NEON_DATA_API_URL = "https://db.example.com/rest/v1/";
        await dataApi("todos", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe("https://db.example.com/rest/v1/todos");
    });

    it("strips multiple trailing slashes from the configured path", async () => {
        env.NEON_DATA_API_URL = "https://db.example.com/neondb///";
        await dataApi("todos", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe(
            "https://db.example.com/neondb/rest/v1/todos",
        );
    });

    it("percent-encodes each resource segment but keeps the separators", async () => {
        await dataApi("rpc/my fn", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe(
            "https://db.example.com/neondb/rest/v1/rpc/my%20fn",
        );
    });

    it("prevents ? and # in a resource from injecting query or fragment", async () => {
        await dataApi("a?b#c", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe(
            "https://db.example.com/neondb/rest/v1/a%3Fb%23c",
        );
    });

    it("serialises the provided query parameters", async () => {
        await dataApi("todos", {
            access: "anonymous",
            query: new URLSearchParams({ select: "*", id: "eq.1" }),
        });
        expect(new URL(lastFetchCall()[0]).search).toBe("?select=*&id=eq.1");
    });

    it("emits no query string when none is provided", async () => {
        await dataApi("todos", { access: "anonymous" });
        expect(lastFetchCall()[0]).not.toContain("?");
    });

    it("discards any query string or hash from the configured URL", async () => {
        env.NEON_DATA_API_URL = "https://db.example.com/neondb?foo=1#frag";
        await dataApi("todos", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe(
            "https://db.example.com/neondb/rest/v1/todos",
        );
    });

    it("throws when NEON_DATA_API_URL is missing", async () => {
        delete env.NEON_DATA_API_URL;
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "NEON_DATA_API_URL is required",
        );
    });

    it("rejects a URL containing a username", async () => {
        env.NEON_DATA_API_URL = "https://user@db.example.com";
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "must not contain database credentials",
        );
    });

    it("rejects a URL containing a password", async () => {
        env.NEON_DATA_API_URL = "https://:secret@db.example.com";
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "must not contain database credentials",
        );
    });

    it("rejects plain HTTP in production", async () => {
        env.NODE_ENV = "production";
        env.NEON_DATA_API_URL = "http://db.example.com";
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "must use HTTPS in production",
        );
    });

    it("accepts HTTPS in production", async () => {
        env.NODE_ENV = "production";
        await expect(
            dataApi("todos", { access: "anonymous" }),
        ).resolves.toEqual([]);
    });

    it("allows plain HTTP outside production (e.g. local dev)", async () => {
        env.NODE_ENV = "development";
        env.NEON_DATA_API_URL = "http://localhost:3000";
        await dataApi("todos", { access: "anonymous" });
        expect(lastFetchCall()[0]).toBe("http://localhost:3000/rest/v1/todos");
    });
});

describe("dataApi - request shape", () => {
    it("defaults to GET with no body or Content-Type", async () => {
        await dataApi("todos", { access: "anonymous" });

        const [, init] = lastFetchCall();
        expect(init.method).toBe("GET");
        expect(init.body).toBeUndefined();
        expect(init.headers["Content-Type"]).toBeUndefined();
        expect(init.headers.Accept).toBe("application/json");
    });

    it("JSON-encodes the body and sets Content-Type", async () => {
        await dataApi("todos", {
            access: "authenticated",
            method: "POST",
            body: { title: "x" },
        });

        const [, init] = lastFetchCall();
        expect(init.method).toBe("POST");
        expect(init.body).toBe('{"title":"x"}');
        expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("treats falsy-but-defined bodies (null, 0, false) as real bodies", async () => {
        await dataApi("todos", {
            access: "authenticated",
            method: "POST",
            body: null,
        });
        expect(lastFetchCall()[1].body).toBe("null");
    });

    it("forwards the Prefer header only when provided", async () => {
        await dataApi("todos", {
            access: "authenticated",
            method: "POST",
            body: {},
            prefer: "return=representation",
        });
        expect(lastFetchCall()[1].headers.Prefer).toBe("return=representation");

        await dataApi("todos", { access: "authenticated" });
        expect(lastFetchCall()[1].headers.Prefer).toBeUndefined();
    });

    it.each(["PATCH", "DELETE"] as const)("supports %s", async (method) => {
        await dataApi("todos", { access: "authenticated", method });
        expect(lastFetchCall()[1].method).toBe(method);
    });
});

describe("dataApi - response handling", () => {
    it("parses and returns a JSON body", async () => {
        fetchMock.mockResolvedValue(fakeResponse('[{"id":1}]'));
        await expect(
            dataApi<{ id: number }[]>("todos", { access: "anonymous" }),
        ).resolves.toEqual([{ id: 1 }]);
    });

    it("returns an empty array for an empty body (e.g. 204)", async () => {
        fetchMock.mockResolvedValue(fakeResponse("", { status: 204 }));
        await expect(dataApi("todos", { access: "anonymous" })).resolves.toEqual(
            [],
        );
    });

    it("rejects when a successful response has malformed JSON", async () => {
        fetchMock.mockResolvedValue(fakeResponse("not json"));
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            SyntaxError,
        );
    });

    it("surfaces the API's JSON error message and status", async () => {
        fetchMock.mockResolvedValue(
            fakeResponse('{"message":"bad column"}', {
                ok: false,
                status: 400,
                statusText: "Bad Request",
            }),
        );
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "Neon Data API request failed (400): bad column",
        );
    });

    it("falls back to statusText and never leaks a non-JSON error body", async () => {
        fetchMock.mockResolvedValue(
            fakeResponse("<html>internal secret</html>", {
                ok: false,
                status: 502,
                statusText: "Bad Gateway",
            }),
        );

        const error = await dataApi("todos", { access: "anonymous" }).catch(
            (e: Error) => e,
        );
        expect((error as Error).message).toBe(
            "Neon Data API request failed (502): Bad Gateway",
        );
        expect((error as Error).message).not.toContain("secret");
    });

    it("falls back to statusText when JSON has no string `message`", async () => {
        fetchMock.mockResolvedValue(
            fakeResponse('{"message":42}', {
                ok: false,
                status: 500,
                statusText: "Server Error",
            }),
        );
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "(500): Server Error",
        );
    });

    it("falls back to statusText when JSON is null or a primitive", async () => {
        fetchMock.mockResolvedValue(
            fakeResponse("null", {
                ok: false,
                status: 500,
                statusText: "Server Error",
            }),
        );
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "(500): Server Error",
        );
    });

    it('uses "Request failed" when statusText is empty', async () => {
        fetchMock.mockResolvedValue(
            fakeResponse("", { ok: false, status: 500, statusText: "" }),
        );
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "(500): Request failed",
        );
    });

    it("propagates network failures from fetch", async () => {
        fetchMock.mockRejectedValue(new TypeError("network down"));
        await expect(dataApi("todos", { access: "anonymous" })).rejects.toThrow(
            "network down",
        );
    });
});