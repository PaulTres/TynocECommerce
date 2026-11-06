import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    handlerGET: vi.fn(),
    handlerPOST: vi.fn(),
    checkSubmitRateLimit: vi.fn(),
    checkIdentifierRateLimit: vi.fn(),
    tooManyAttemptsMessage: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
    auth: {
        handler: () => ({ GET: mocks.handlerGET, POST: mocks.handlerPOST }),
    },
}));

vi.mock("@/lib/api/rate-limit", () => ({
    checkSubmitRateLimit: mocks.checkSubmitRateLimit,
    checkIdentifierRateLimit: mocks.checkIdentifierRateLimit,
    tooManyAttemptsMessage: mocks.tooManyAttemptsMessage,
}));

import { GET, POST } from "./route";

const BASE_URL = "https://app.example.com/api/auth";

/** Shape returned by the mocked rate limiters when a request is allowed. */
const allowed = { allowed: true, retryAfterSeconds: 0, headers: {} };

/**
 * Builds a JSON POST request for a given auth sub-path.
 * Accepts a raw string body so tests can also send malformed JSON.
 */
function makeRequest(
    path: string,
    body?: unknown,
    init: { method?: string; rawBody?: string } = {},
): Request {
    const payload =
        init.rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    return new Request(`${BASE_URL}${path}`, {
        method: init.method ?? "POST",
        headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.7",
        },
        body: payload,
    });
}

/** Invokes the exported POST with the Next.js (request, context) argument shape. */
function callPost(request: Request) {
    const context = { params: Promise.resolve({ path: ["sign-in", "email"] }) };
    return (POST as unknown as (r: Request, c: unknown) => Promise<Response>)(
        request,
        context,
    );
}

describe("auth proxy route", () => {
    beforeEach(() => {
        mocks.checkSubmitRateLimit.mockResolvedValue(allowed);
        mocks.checkIdentifierRateLimit.mockResolvedValue(allowed);
        mocks.tooManyAttemptsMessage.mockImplementation(
            (s: number) => `Try again in ${s}s`,
        );
        mocks.handlerPOST.mockImplementation(
            async () => new Response("proxied", { status: 200 }),
        );
        mocks.handlerGET.mockImplementation(
            async () => new Response("proxied-get"),
        );
    });

    describe("GET", () => {
        it("is the upstream Neon Auth GET handler, untouched by rate limiting", () => {
            // GET must be a straight pass-through: same function reference, no wrapper.
            expect(GET).toBe(mocks.handlerGET);
        });
    });

    describe("POST pass-through (unguarded requests)", () => {
        it.each([["/sign-out"], ["/get-session"]])(
            "forwards %s without touching the rate limiters",
            async (path) => {
                const req = makeRequest(path, { email: "a@b.com" });

                const res = await callPost(req);

                expect(res.status).toBe(200);
                expect(await res.text()).toBe("proxied");
                expect(mocks.checkSubmitRateLimit).not.toHaveBeenCalled();
                expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
                expect(mocks.handlerPOST).toHaveBeenCalledTimes(1);
            },
        );

        it("does not rate limit non-POST methods even on a guarded path", async () => {
            // The guard only applies to POST; other verbs go straight to the proxy.
            const req = makeRequest("/sign-in/email", undefined, {
                method: "PUT",
            });

            await callPost(req);

            expect(mocks.checkSubmitRateLimit).not.toHaveBeenCalled();
            expect(mocks.handlerPOST).toHaveBeenCalledTimes(1);
        });

        it("forwards the exact same arguments (request + context) to the upstream handler", async () => {
            const req = makeRequest("/sign-out", {});
            const context = { params: Promise.resolve({ path: ["sign-out"] }) };

            await (
                POST as unknown as (r: Request, c: unknown) => Promise<Response>
            )(req, context);

            expect(mocks.handlerPOST).toHaveBeenCalledWith(req, context);
        });
    });

    describe("POST guarded email endpoints", () => {
        it.each([
            ["/sign-in/email", "login"],
            ["/sign-up/email", "register"],
        ])(
            "applies IP + identifier limits to %s as operation '%s'",
            async (path, operation) => {
                const req = makeRequest(path, {
                    email: "User@Example.com",
                    password: "pw",
                });

                const res = await callPost(req);

                expect(mocks.checkSubmitRateLimit).toHaveBeenCalledWith(
                    { headers: req.headers },
                    operation,
                );

                expect(mocks.checkIdentifierRateLimit).toHaveBeenCalledWith(
                    operation,
                    "User@Example.com",
                );

                expect(mocks.handlerPOST).toHaveBeenCalledTimes(1);
                expect(res.status).toBe(200);
            },
        );

        it("still guards the path when a query string is present", async () => {
            // `pathname` excludes the query string, so `?x=1` must not bypass the guard.
            const req = makeRequest("/sign-in/email?x=1", { email: "a@b.com" });

            await callPost(req);

            expect(mocks.checkSubmitRateLimit).toHaveBeenCalledWith(
                expect.anything(),
                "login",
            );
        });

        it("runs the IP check before the identifier check", async () => {
            const order: string[] = [];
            mocks.checkSubmitRateLimit.mockImplementation(async () => {
                order.push("ip");
                return allowed;
            });
            mocks.checkIdentifierRateLimit.mockImplementation(async () => {
                order.push("identifier");
                return allowed;
            });

            await callPost(makeRequest("/sign-in/email", { email: "a@b.com" }));

            expect(order).toEqual(["ip", "identifier"]);
        });

        it("leaves the request body readable for the upstream handler (request is cloned)", async () => {
            // The guard reads the body via request.clone(); the proxy must still be able to read it.
            let bodySeenByProxy: unknown;
            mocks.handlerPOST.mockImplementation(async (req: Request) => {
                bodySeenByProxy = await req.json();
                return new Response("ok");
            });

            await callPost(
                makeRequest("/sign-in/email", {
                    email: "a@b.com",
                    password: "pw",
                }),
            );

            expect(bodySeenByProxy).toEqual({
                email: "a@b.com",
                password: "pw",
            });
        });
    });

    describe("POST rate limiting responses", () => {
        it("returns 429 with the limiter's headers when the IP limit is exceeded", async () => {
            mocks.checkSubmitRateLimit.mockResolvedValue({
                allowed: false,
                retryAfterSeconds: 42,
                headers: { "Retry-After": "42", "X-RateLimit-Remaining": "0" },
            });

            const res = await callPost(
                makeRequest("/sign-in/email", { email: "a@b.com" }),
            );

            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBe("42");
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
            expect(await res.json()).toEqual({
                error: {
                    code: "RATE_LIMITED",
                    message:
                        "Too many attempts. Please try again in 42 seconds.",
                },
            });
        });

        it("short-circuits: no identifier check and no upstream call when IP-blocked", async () => {
            mocks.checkSubmitRateLimit.mockResolvedValue({
                allowed: false,
                retryAfterSeconds: 10,
                headers: {},
            });

            await callPost(makeRequest("/sign-up/email", { email: "a@b.com" }));

            expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
            expect(mocks.handlerPOST).not.toHaveBeenCalled();
        });

        it("returns 429 when the per-identifier limit is exceeded, without calling upstream", async () => {
            mocks.checkIdentifierRateLimit.mockResolvedValue({
                allowed: false,
                retryAfterSeconds: 300,
                headers: { "Retry-After": "300" },
            });

            const res = await callPost(
                makeRequest("/sign-in/email", { email: "victim@x.com" }),
            );

            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBe("300");
            expect(await res.json()).toEqual({
                error: {
                    code: "RATE_LIMITED",
                    message:
                        "Too many attempts. Please try again in 5 minutes.",
                },
            });
            expect(mocks.handlerPOST).not.toHaveBeenCalled();
        });
    });

    describe("POST body edge cases", () => {
        it.each([
            ["missing email", {}],
            ["empty email", { email: "" }],
            ["whitespace-only email", { email: "   " }],
            ["non-string email (number)", { email: 123 }],
            ["non-string email (object)", { email: { $ne: null } }],
            ["null email", { email: null }],
        ])(
            "skips the identifier limit but still applies the IP limit: %s",
            async (_label, body) => {
                const res = await callPost(makeRequest("/sign-in/email", body));

                expect(mocks.checkSubmitRateLimit).toHaveBeenCalledTimes(1);
                expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
                // Upstream still gets the request so it can return its normal validation error.
                expect(mocks.handlerPOST).toHaveBeenCalledTimes(1);
                expect(res.status).toBe(200);
            },
        );

        it("swallows malformed JSON and lets the upstream handler respond", async () => {
            const req = makeRequest("/sign-in/email", undefined, {
                rawBody: "{not json",
            });

            const res = await callPost(req);

            expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
            expect(mocks.handlerPOST).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(200);
        });

        it("handles an empty body the same way as malformed JSON", async () => {
            const res = await callPost(makeRequest("/sign-up/email"));

            expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
            expect(mocks.handlerPOST).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(200);
        });
    });
});
