import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    readJson: vi.fn(),
    checkSubmitRateLimit: vi.fn(),
    checkIdentifierRateLimit: vi.fn(),
    tooManyAttemptsMessage: vi.fn(),
    parse: vi.fn(),
    registerUser: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
    readJson: mocks.readJson,
    withErrors: (fn: (req: Request) => Promise<Response>) => fn,
}));

vi.mock("@/lib/api/rate-limit", () => ({
    checkSubmitRateLimit: mocks.checkSubmitRateLimit,
    checkIdentifierRateLimit: mocks.checkIdentifierRateLimit,
    tooManyAttemptsMessage: mocks.tooManyAttemptsMessage,
}));

vi.mock("@/lib/validation/schemas", () => ({
    registerSchema: { parse: mocks.parse },
}));

vi.mock("@/services/auth.service", () => ({
    registerUser: mocks.registerUser,
}));

import { POST } from "./route";

/** Builds a minimal POST request; the body is irrelevant because readJson is mocked. */
function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: "{}",
    });
}

const validInput = {
    email: "jane@example.com",
    password: "S3cure-passw0rd!",
    name: "Jane",
};

describe("POST /api/auth/register", () => {
    beforeEach(() => {
        mocks.readJson.mockResolvedValue({ raw: "body" });
        mocks.parse.mockReturnValue(validInput);
        mocks.checkSubmitRateLimit.mockResolvedValue({ allowed: true });
        mocks.checkIdentifierRateLimit.mockResolvedValue({ allowed: true });
        mocks.tooManyAttemptsMessage.mockImplementation(
            (seconds: number) => `Too many attempts. Retry in ${seconds}s.`,
        );
        mocks.registerUser.mockResolvedValue({
            id: "user_1",
            email: validInput.email,
        });
    });

    describe("success", () => {
        it("returns 201 with the created user", async () => {
            const res = await POST(makeRequest());

            expect(res.status).toBe(201);
            expect(await res.json()).toEqual({
                user: { id: "user_1", email: validInput.email },
            });
        });

        it("passes the validated (parsed) input to registerUser, not the raw body", async () => {
            await POST(makeRequest());

            expect(mocks.parse).toHaveBeenCalledWith({ raw: "body" });
            expect(mocks.registerUser).toHaveBeenCalledWith(validInput);
        });

        it("rate-limits by IP using the request headers and the 'register' scope", async () => {
            const req = makeRequest({ "x-forwarded-for": "203.0.113.7" });

            await POST(req);

            expect(mocks.checkSubmitRateLimit).toHaveBeenCalledTimes(1);
            const [ctx, scope] = mocks.checkSubmitRateLimit.mock.calls[0];
            expect(scope).toBe("register");
            expect(ctx.headers).toBe(req.headers);
            expect(ctx.headers.get("x-forwarded-for")).toBe("203.0.113.7");
        });

        it("rate-limits by the parsed email identifier", async () => {
            await POST(makeRequest());

            expect(mocks.checkIdentifierRateLimit).toHaveBeenCalledWith(
                "register",
                validInput.email,
            );
        });

        it("runs checks in order: IP limit -> parse -> identifier limit -> register", async () => {
            await POST(makeRequest());

            const order = [
                mocks.checkSubmitRateLimit,
                mocks.parse,
                mocks.checkIdentifierRateLimit,
                mocks.registerUser,
            ].map((m) => m.mock.invocationCallOrder[0]);

            expect(order).toEqual([...order].sort((a, b) => a - b));
        });
    });

    describe("IP rate limit", () => {
        const ipHeaders = { "Retry-After": "42", "X-RateLimit-Remaining": "0" };

        beforeEach(() => {
            mocks.checkSubmitRateLimit.mockResolvedValue({
                allowed: false,
                retryAfterSeconds: 42,
                headers: ipHeaders,
            });
        });

        it("returns 429 with RATE_LIMITED error body and limiter headers", async () => {
            const res = await POST(makeRequest());

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

        it("short-circuits before reading the body, validating or registering", async () => {
            await POST(makeRequest());

            expect(mocks.readJson).not.toHaveBeenCalled();
            expect(mocks.parse).not.toHaveBeenCalled();
            expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
            expect(mocks.registerUser).not.toHaveBeenCalled();
        });
    });

    describe("identifier (email) rate limit", () => {
        beforeEach(() => {
            mocks.checkIdentifierRateLimit.mockResolvedValue({
                allowed: false,
                retryAfterSeconds: 120,
                headers: { "Retry-After": "120" },
            });
        });

        it("returns 429 with RATE_LIMITED error body and limiter headers", async () => {
            const res = await POST(makeRequest());

            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBe("120");
            expect(await res.json()).toEqual({
                error: {
                    code: "RATE_LIMITED",
                    message:
                        "Too many attempts. Please try again in 2 minutes.",
                },
            });
        });

        it("does not create the user", async () => {
            await POST(makeRequest());

            expect(mocks.registerUser).not.toHaveBeenCalled();
        });
    });

    describe("error propagation (handled by withErrors in production)", () => {
        it("rejects when body validation fails and skips identifier limit + registration", async () => {
            const validationError = new Error("invalid body");
            mocks.parse.mockImplementation(() => {
                throw validationError;
            });

            await expect(POST(makeRequest())).rejects.toBe(validationError);

            expect(mocks.checkIdentifierRateLimit).not.toHaveBeenCalled();
            expect(mocks.registerUser).not.toHaveBeenCalled();
        });

        it("rejects when the body cannot be read (e.g. malformed JSON)", async () => {
            const parseError = new Error("Invalid JSON");
            mocks.readJson.mockRejectedValue(parseError);

            await expect(POST(makeRequest())).rejects.toBe(parseError);

            expect(mocks.parse).not.toHaveBeenCalled();
            expect(mocks.registerUser).not.toHaveBeenCalled();
        });

        it("rejects when registerUser fails (e.g. email already taken -> 409)", async () => {
            const conflict = new Error("EMAIL_TAKEN");
            mocks.registerUser.mockRejectedValue(conflict);

            await expect(POST(makeRequest())).rejects.toBe(conflict);
        });

        it("rejects when the rate limiter backend itself fails", async () => {
            const redisDown = new Error("rate limiter unavailable");
            mocks.checkSubmitRateLimit.mockRejectedValue(redisDown);

            await expect(POST(makeRequest())).rejects.toBe(redisDown);

            expect(mocks.registerUser).not.toHaveBeenCalled();
        });
    });
});
