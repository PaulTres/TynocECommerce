import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SLUG_KEY_LENGTH, REDIS_TIMEOUT_MS } from "../constants";

const mocks = vi.hoisted(() => {
    const limit = vi.fn();

    const redisConstructor = vi.fn();

    const ratelimitConstructor = vi.fn();
    const multiRegionConstructor = vi.fn();

    const slidingWindow = vi.fn();
    const multiRegionSlidingWindow = vi.fn();

    const after = vi.fn();

    return {
        limit,
        redisConstructor,
        ratelimitConstructor,
        multiRegionConstructor,
        slidingWindow,
        multiRegionSlidingWindow,
        after,
    };
});

vi.mock("@upstash/redis", () => ({
    Redis: mocks.redisConstructor,
}));

vi.mock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(mocks.ratelimitConstructor, {
        slidingWindow: mocks.slidingWindow,
    }),
    MultiRegionRatelimit: Object.assign(mocks.multiRegionConstructor, {
        slidingWindow: mocks.multiRegionSlidingWindow,
    }),
}));

vi.mock("next/server", () => ({
    after: mocks.after,
}));

vi.mock("server-only", () => ({}));

async function loadModule() {
    return import("./rate-limit");
}

// Generate the expected hash using the same documented algorithm.
function hash(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

// Construct a successful Upstash rate-limit response.
function successResponse() {
    return {
        success: true,
        pending: Promise.resolve(),
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60_000,
    };
}

// Construct a rejected Upstash rate-limit response.
function deniedResponse(
    overrides: Partial<{
        limit: number;
        remaining: number;
        reset: number;
    }> = {},
) {
    return {
        success: false,
        pending: Promise.resolve(),
        limit: 10,
        remaining: 0,
        reset: Date.now() + 60_000,
        ...overrides,
    };
}

describe("rate-limit", () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.resetModules();

        vi.clearAllMocks();

        mocks.limit.mockReset();
        mocks.limit.mockResolvedValue(successResponse());

        mocks.redisConstructor.mockImplementation((options) => ({
            options,
        }));

        mocks.ratelimitConstructor.mockImplementation(() => ({
            limit: mocks.limit,
        }));

        mocks.multiRegionConstructor.mockImplementation(() => ({
            limit: mocks.limit,
        }));

        mocks.slidingWindow.mockImplementation((tokens, duration) => ({
            type: "slidingWindow",
            tokens,
            duration,
        }));

        mocks.multiRegionSlidingWindow.mockImplementation(
            (tokens, duration) => ({
                type: "multiRegionSlidingWindow",
                tokens,
                duration,
            }),
        );

        mocks.after.mockImplementation(() => undefined);

        consoleWarnSpy = vi
            .spyOn(console, "warn")
            .mockImplementation(() => undefined);

        consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        // Start every test with no Redis configuration.
        vi.stubEnv("UPSTASH_REDIS_REST_URLS", undefined);
        vi.stubEnv("UPSTASH_REDIS_REST_TOKENS", undefined);
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
        vi.stubEnv("NODE_ENV", "test");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    describe("tooManyAttemptsMessage", () => {
        it("formats retry delays shorter than one minute in seconds", async () => {
            const { tooManyAttemptsMessage } = await loadModule();

            expect(tooManyAttemptsMessage(30)).toBe(
                "Too many attempts. Please try again in 30 seconds.",
            );
        });

        it("formats exactly 59 seconds in seconds", async () => {
            const { tooManyAttemptsMessage } = await loadModule();

            expect(tooManyAttemptsMessage(59)).toBe(
                "Too many attempts. Please try again in 59 seconds.",
            );
        });

        it("formats exactly 60 seconds in minutes", async () => {
            const { tooManyAttemptsMessage } = await loadModule();

            expect(tooManyAttemptsMessage(60)).toBe(
                "Too many attempts. Please try again in 1 minutes.",
            );
        });

        it("rounds up partial minutes", async () => {
            const { tooManyAttemptsMessage } = await loadModule();

            expect(tooManyAttemptsMessage(61)).toBe(
                "Too many attempts. Please try again in 2 minutes.",
            );

            expect(tooManyAttemptsMessage(837)).toBe(
                "Too many attempts. Please try again in 14 minutes.",
            );
        });

        it("handles zero seconds", async () => {
            const { tooManyAttemptsMessage } = await loadModule();

            expect(tooManyAttemptsMessage(0)).toBe(
                "Too many attempts. Please try again in 0 seconds.",
            );
        });
    });

    describe("getClientIp", () => {
        it("returns the x-real-ip header when available", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "192.168.1.10",
                "x-forwarded-for": "10.0.0.1",
            });

            expect(getClientIp(headers)).toBe("192.168.1.10");
        });

        it("trims whitespace from x-real-ip", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "  192.168.1.10  ",
            });

            expect(getClientIp(headers)).toBe("192.168.1.10");
        });

        it("uses the first x-forwarded-for address when x-real-ip is absent", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-forwarded-for": "192.168.1.10, 10.0.0.1, 10.0.0.2",
            });

            expect(getClientIp(headers)).toBe("192.168.1.10");
        });

        it("trims the first forwarded address", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-forwarded-for": " 192.168.1.10 , 10.0.0.1",
            });

            expect(getClientIp(headers)).toBe("192.168.1.10");
        });

        it("returns unknown when no IP headers exist", async () => {
            const { getClientIp } = await loadModule();

            expect(getClientIp(new Headers())).toBe("unknown");
        });

        it("returns unknown for an invalid IP", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "not-an-ip",
            });

            expect(getClientIp(headers)).toBe("unknown");
        });

        it("returns unknown for an empty IP", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": " ",
            });

            expect(getClientIp(headers)).toBe("unknown");
        });

        it("returns IPv4 addresses unchanged", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "203.0.113.42",
            });

            expect(getClientIp(headers)).toBe("203.0.113.42");
        });

        it("normalizes IPv6 addresses to their /64 prefix", async () => {
            const { getClientIp } = await loadModule();

            const first = new Headers({
                "x-real-ip": "2001:db8:abcd:1234:1111:2222:3333:4444",
            });

            const second = new Headers({
                "x-real-ip": "2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd",
            });

            expect(getClientIp(first)).toBe("2001:db8:abcd:1234::/64");
            expect(getClientIp(second)).toBe("2001:db8:abcd:1234::/64");
        });

        it("normalizes compressed IPv6 addresses", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "2001:db8::1",
            });

            expect(getClientIp(headers)).toBe("2001:db8:0:0::/64");
        });

        it("normalizes IPv6 addresses containing a zone identifier", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "fe80::1%eth0",
            });

            expect(getClientIp(headers)).toBe("fe80:0:0:0::/64");
        });

        it("converts IPv4-mapped IPv6 addresses to IPv4", async () => {
            const { getClientIp } = await loadModule();

            const headers = new Headers({
                "x-real-ip": "::ffff:192.168.1.10",
            });

            expect(getClientIp(headers)).toBe("192.168.1.10");
        });
    });

    describe("Redis configuration", () => {
        it("allows requests when Redis is not configured", async () => {
            const { checkSubmitRateLimit, checkIdentifierRateLimit } =
                await loadModule();

            const submit = await checkSubmitRateLimit(
                { headers: new Headers() },
                "login",
            );

            const identifier = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(submit).toEqual({ allowed: true });
            expect(identifier).toEqual({ allowed: true });

            expect(mocks.redisConstructor).not.toHaveBeenCalled();
            expect(mocks.limit).not.toHaveBeenCalled();
        });

        it("warns only once when Redis is missing in non-production", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            await checkSubmitRateLimit({ headers: new Headers() }, "register");

            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("rate limiting is DISABLED"),
            );
        });

        it("logs an error instead of a warning in production when Redis is missing", async () => {
            vi.stubEnv("NODE_ENV", "production");

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("rate limiting is DISABLED"),
            );

            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it("does not repeatedly warn after Redis configuration has been cached", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            await checkSubmitRateLimit({ headers: new Headers() }, "register");

            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        });

        it("creates three single-region limiters", async () => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            expect(mocks.redisConstructor).toHaveBeenCalledTimes(1);

            expect(mocks.redisConstructor).toHaveBeenCalledWith({
                url: "https://example.upstash.io",
                token: "secret-token",
            });

            expect(mocks.ratelimitConstructor).toHaveBeenCalledTimes(3);
            expect(mocks.multiRegionConstructor).not.toHaveBeenCalled();

            expect(mocks.slidingWindow).toHaveBeenCalledTimes(3);

            expect(mocks.ratelimitConstructor).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    prefix: "ecommerce:rl:submit:global",
                    timeout: REDIS_TIMEOUT_MS,
                }),
            );

            expect(mocks.ratelimitConstructor).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    prefix: "ecommerce:rl:submit:form",
                    timeout: REDIS_TIMEOUT_MS,
                }),
            );

            expect(mocks.ratelimitConstructor).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({
                    prefix: "ecommerce:rl:submit:identifier",
                    timeout: REDIS_TIMEOUT_MS,
                }),
            );
        });

        it("creates three multi-region limiters for multiple Redis instances", async () => {
            vi.stubEnv(
                "UPSTASH_REDIS_REST_URLS",
                "https://eu.upstash.io, https://us.upstash.io",
            );

            vi.stubEnv("UPSTASH_REDIS_REST_TOKENS", "eu-token, us-token");

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            expect(mocks.redisConstructor).toHaveBeenCalledTimes(2);

            expect(mocks.redisConstructor).toHaveBeenNthCalledWith(1, {
                url: "https://eu.upstash.io",
                token: "eu-token",
            });

            expect(mocks.redisConstructor).toHaveBeenNthCalledWith(2, {
                url: "https://us.upstash.io",
                token: "us-token",
            });

            expect(mocks.multiRegionConstructor).toHaveBeenCalledTimes(3);
            expect(mocks.ratelimitConstructor).not.toHaveBeenCalled();

            expect(mocks.multiRegionSlidingWindow).toHaveBeenCalledTimes(3);
        });

        it("trims whitespace and ignores empty Redis configuration entries", async () => {
            vi.stubEnv(
                "UPSTASH_REDIS_REST_URLS",
                " https://eu.upstash.io , , https://us.upstash.io ",
            );

            vi.stubEnv("UPSTASH_REDIS_REST_TOKENS", " eu-token , , us-token ");

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            expect(mocks.redisConstructor).toHaveBeenCalledTimes(2);
            expect(mocks.multiRegionConstructor).toHaveBeenCalledTimes(3);
        });

        it("falls back to the singular environment variables when plural variables are absent", async () => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://single.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "single-token");

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            expect(mocks.redisConstructor).toHaveBeenCalledWith({
                url: "https://single.upstash.io",
                token: "single-token",
            });

            expect(mocks.ratelimitConstructor).toHaveBeenCalledTimes(3);
        });

        it("disables rate limiting when the number of URLs and tokens differs", async () => {
            vi.stubEnv(
                "UPSTASH_REDIS_REST_URLS",
                "https://eu.upstash.io,https://us.upstash.io",
            );

            vi.stubEnv("UPSTASH_REDIS_REST_TOKENS", "eu-token");

            const { checkSubmitRateLimit } = await loadModule();

            const result = await checkSubmitRateLimit(
                { headers: new Headers() },
                "login",
            );

            expect(result).toEqual({ allowed: true });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    "Number of Redis URLs and tokens differ",
                ),
            );

            expect(mocks.redisConstructor).not.toHaveBeenCalled();
            expect(mocks.ratelimitConstructor).not.toHaveBeenCalled();
        });

        it("caches initialized limiters across requests", async () => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit({ headers: new Headers() }, "login");

            await checkSubmitRateLimit({ headers: new Headers() }, "register");

            expect(mocks.redisConstructor).toHaveBeenCalledTimes(1);
            expect(mocks.ratelimitConstructor).toHaveBeenCalledTimes(3);
        });
    });

    describe("checkSubmitRateLimit", () => {
        beforeEach(() => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");
        });

        it("allows a request when both global and per-form checks succeed", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            const result = await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "login",
            );

            expect(result).toEqual({ allowed: true });

            expect(mocks.limit).toHaveBeenCalledTimes(2);
        });

        it("checks the global limiter before the per-form limiter", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "login",
            );

            const clientHash = hash("192.168.1.10");

            expect(mocks.limit).toHaveBeenNthCalledWith(1, `ip:${clientHash}`);

            expect(mocks.limit).toHaveBeenNthCalledWith(
                2,
                `login:${clientHash}`,
            );
        });

        it("uses the x-forwarded-for IP when x-real-ip is unavailable", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-forwarded-for": "203.0.113.42, 10.0.0.1",
                    }),
                },
                "login",
            );

            expect(mocks.limit).toHaveBeenNthCalledWith(
                1,
                `ip:${hash("203.0.113.42")}`,
            );
        });

        it("uses the unknown bucket when the client IP is invalid", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "invalid",
                    }),
                },
                "login",
            );

            expect(mocks.limit).toHaveBeenNthCalledWith(
                1,
                `ip:${hash("unknown")}`,
            );
        });

        it("returns the global denial without checking the per-form limiter", async () => {
            mocks.limit.mockResolvedValueOnce(deniedResponse());

            const { checkSubmitRateLimit } = await loadModule();

            const result = await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "login",
            );

            expect(result).toMatchObject({
                allowed: false,
                retryAfterSeconds: expect.any(Number),
                headers: expect.any(Object),
            });

            expect(mocks.limit).toHaveBeenCalledTimes(1);
        });

        it("returns the per-form denial when the global check succeeds", async () => {
            mocks.limit
                .mockResolvedValueOnce(successResponse())
                .mockResolvedValueOnce(deniedResponse());

            const { checkSubmitRateLimit } = await loadModule();

            const result = await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "register",
            );

            expect(result).toMatchObject({
                allowed: false,
                retryAfterSeconds: expect.any(Number),
            });

            expect(mocks.limit).toHaveBeenCalledTimes(2);
        });

        it("truncates slugs to MAX_SLUG_KEY_LENGTH", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            const slug = "a".repeat(MAX_SLUG_KEY_LENGTH * 2);

            await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                slug,
            );

            const clientHash = hash("192.168.1.10");

            expect(mocks.limit).toHaveBeenNthCalledWith(
                2,
                `${"a".repeat(MAX_SLUG_KEY_LENGTH)}:${clientHash}`,
            );
        });

        it("allows requests when Redis throws an error", async () => {
            const error = new Error("Redis unavailable");

            mocks.limit.mockRejectedValueOnce(error);

            const { checkSubmitRateLimit } = await loadModule();

            const result = await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "login",
            );

            expect(result).toEqual({ allowed: true });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "[rate-limit] Redis check failed - allowing request",
                error,
            );
        });
    });

    describe("checkIdentifierRateLimit", () => {
        beforeEach(() => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");
        });

        it("allows an identifier when the limiter succeeds", async () => {
            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toEqual({ allowed: true });
            expect(mocks.limit).toHaveBeenCalledTimes(1);
        });

        it("normalizes identifiers by trimming whitespace and converting to lowercase", async () => {
            const { checkIdentifierRateLimit } = await loadModule();

            await checkIdentifierRateLimit("login", "  USER@EXAMPLE.COM  ");

            expect(mocks.limit).toHaveBeenCalledWith(
                `login:${hash("user@example.com")}`,
            );
        });

        it("uses the identifier limiter rather than the IP-based limiters", async () => {
            const { checkIdentifierRateLimit } = await loadModule();

            await checkIdentifierRateLimit("register", "user@example.com");

            expect(mocks.limit).toHaveBeenCalledTimes(1);

            expect(mocks.ratelimitConstructor).toHaveBeenCalledTimes(3);
        });

        it("truncates the slug to MAX_SLUG_KEY_LENGTH", async () => {
            const { checkIdentifierRateLimit } = await loadModule();

            const slug = "a".repeat(MAX_SLUG_KEY_LENGTH * 2);

            await checkIdentifierRateLimit(slug, "user@example.com");

            expect(mocks.limit).toHaveBeenCalledWith(
                `${"a".repeat(MAX_SLUG_KEY_LENGTH)}:${hash("user@example.com")}`,
            );
        });

        it("returns a denial when the identifier limiter rejects the request", async () => {
            mocks.limit.mockResolvedValueOnce(deniedResponse());

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toMatchObject({
                allowed: false,
                retryAfterSeconds: expect.any(Number),
                headers: expect.any(Object),
            });
        });

        it("allows requests when Redis throws an error", async () => {
            const error = new Error("Redis unavailable");

            mocks.limit.mockRejectedValueOnce(error);

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toEqual({ allowed: true });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "[rate-limit] Redis check failed - allowing request",
                error,
            );
        });

        it("returns allowed when Redis is not configured", async () => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toEqual({ allowed: true });

            expect(mocks.limit).not.toHaveBeenCalled();
        });
    });

    describe("denial responses", () => {
        beforeEach(() => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");
        });

        it("returns the expected rate-limit headers", async () => {
            const now = Date.now();

            mocks.limit.mockResolvedValueOnce(
                deniedResponse({
                    limit: 10,
                    remaining: 0,
                    reset: now + 30_000,
                }),
            );

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toEqual({
                allowed: false,
                retryAfterSeconds: 30,
                headers: {
                    "Retry-After": "30",
                    "X-RateLimit-Limit": "10",
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": String(
                        Math.ceil((now + 30_000) / 1000),
                    ),
                },
            });
        });

        it("never returns a retry delay below one second", async () => {
            const now = Date.now();

            mocks.limit.mockResolvedValueOnce(
                deniedResponse({
                    reset: now - 10_000,
                }),
            );

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toMatchObject({
                allowed: false,
                retryAfterSeconds: 1,
                headers: {
                    "Retry-After": "1",
                },
            });
        });

        it("does not return a negative remaining count", async () => {
            mocks.limit.mockResolvedValueOnce(
                deniedResponse({
                    remaining: -5,
                }),
            );

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toMatchObject({
                allowed: false,
                headers: {
                    "X-RateLimit-Remaining": "0",
                },
            });
        });

        it("rounds the reset timestamp up to whole seconds", async () => {
            const now = Date.now();

            mocks.limit.mockResolvedValueOnce(
                deniedResponse({
                    reset: now + 1500,
                }),
            );

            const { checkIdentifierRateLimit } = await loadModule();

            const result = await checkIdentifierRateLimit(
                "login",
                "user@example.com",
            );

            expect(result).toMatchObject({
                allowed: false,
                headers: {
                    "X-RateLimit-Reset": String(Math.ceil((now + 1500) / 1000)),
                },
            });
        });
    });

    describe("background synchronization", () => {
        beforeEach(() => {
            vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");

            vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");
        });

        it("registers pending work with Next.js after()", async () => {
            const { checkIdentifierRateLimit } = await loadModule();

            await checkIdentifierRateLimit("login", "user@example.com");

            expect(mocks.after).toHaveBeenCalledTimes(1);
            expect(mocks.after).toHaveBeenCalledWith(expect.any(Function));
        });

        it("registers pending work for each limiter consumption", async () => {
            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "login",
            );

            expect(mocks.after).toHaveBeenCalledTimes(2);
        });

        it("does not register the per-form synchronization when the global check denies", async () => {
            mocks.limit.mockResolvedValueOnce(deniedResponse());

            const { checkSubmitRateLimit } = await loadModule();

            await checkSubmitRateLimit(
                {
                    headers: new Headers({
                        "x-real-ip": "192.168.1.10",
                    }),
                },
                "login",
            );

            expect(mocks.after).toHaveBeenCalledTimes(1);
        });

        it("ignores errors thrown by after() outside a request scope", async () => {
            mocks.after.mockImplementation(() => {
                throw new Error("Not in a request scope");
            });

            const { checkIdentifierRateLimit } = await loadModule();

            await expect(
                checkIdentifierRateLimit("login", "user@example.com"),
            ).resolves.toEqual({ allowed: true });

            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });
    });
});
