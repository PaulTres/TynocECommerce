import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ConflictError } from "@/lib/errors";
import { registerUser, verifyCredentials } from "./auth.service";

const { signUpEmail, signInEmail } = vi.hoisted(() => ({
    signUpEmail: vi.fn(),
    signInEmail: vi.fn(),
}));

/**
 * Replace the Neon Auth client with controllable fakes.
 */
vi.mock("@/lib/auth/server", () => ({
    auth: {
        signUp: { email: signUpEmail },
        signIn: { email: signInEmail },
    },
}));

const NOW = new Date("2025-01-15T12:00:00.000Z");

/** Valid registration payload reused across tests. */
const registerInput = {
    email: "jane@example.com",
    password: "S3cure-passw0rd!",
    name: "Jane Doe",
};

/** Builds a Neon Auth user, letting each test override only what it cares about. */
function makeAuthUser(overrides: Record<string, unknown> = {}) {
    return {
        id: "user_123",
        email: "jane@example.com",
        name: "Jane Doe",
        createdAt: new Date("2024-06-01T08:30:00.000Z"),
        ...overrides,
    };
}

beforeEach(() => {
    // Reset implementations and call history.
    signUpEmail.mockReset();
    signInEmail.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    // Restore real timers.
    vi.useRealTimers();
});

describe("registerUser", () => {
    describe("happy path", () => {
        it("forwards exactly email, password and name to Neon Auth", async () => {
            signUpEmail.mockResolvedValue({
                data: { user: makeAuthUser() },
                error: null,
            });

            await registerUser(registerInput);

            expect(signUpEmail).toHaveBeenCalledTimes(1);
            expect(signUpEmail).toHaveBeenCalledWith({
                email: registerInput.email,
                password: registerInput.password,
                name: registerInput.name,
            });
        });

        it("maps the provider user to the public User shape", async () => {
            signUpEmail.mockResolvedValue({
                data: { user: makeAuthUser() },
                error: null,
            });

            const result = await registerUser(registerInput);

            expect(result).toEqual({
                id: "user_123",
                email: "jane@example.com",
                name: "Jane Doe",
                createdAt: "2024-06-01T08:30:00.000Z",
            });
        });

        it("never leaks extra provider fields (e.g. password hashes, tokens)", async () => {
            signUpEmail.mockResolvedValue({
                data: {
                    user: makeAuthUser({
                        passwordHash: "$2b$10$secret",
                        sessionToken: "tok_abc",
                        emailVerified: false,
                    }),
                },
                error: null,
            });

            const result = await registerUser(registerInput);

            //The public user must contain only these keys.
            expect(Object.keys(result).sort()).toEqual([
                "createdAt",
                "email",
                "id",
                "name",
            ]);
            expect(JSON.stringify(result)).not.toContain("secret");
            expect(JSON.stringify(result)).not.toContain("tok_abc");
        });
    });

    describe("createdAt / name normalisation", () => {
        it("serialises a Date createdAt to an ISO string", async () => {
            signUpEmail.mockResolvedValue({
                data: {
                    user: makeAuthUser({
                        createdAt: new Date("2023-03-04T05:06:07.000Z"),
                    }),
                },
                error: null,
            });

            const result = await registerUser(registerInput);

            expect(result.createdAt).toBe("2023-03-04T05:06:07.000Z");
        });

        it("normalises a string createdAt into canonical ISO format", async () => {
            signUpEmail.mockResolvedValue({
                data: {
                    user: makeAuthUser({ createdAt: "2023-03-04T05:06:07Z" }),
                },
                error: null,
            });

            const result = await registerUser(registerInput);

            expect(result.createdAt).toBe("2023-03-04T05:06:07.000Z");
        });

        it.each([
            ["undefined", undefined],
            ["empty string", ""],
        ])(
            "falls back to the current time when createdAt is %s",
            async (_label, createdAt) => {
                signUpEmail.mockResolvedValue({
                    data: { user: makeAuthUser({ createdAt }) },
                    error: null,
                });

                const result = await registerUser(registerInput);

                expect(result.createdAt).toBe(NOW.toISOString());
            },
        );

        it.each([
            ["null", null],
            ["undefined", undefined],
        ])("coerces a %s name to an empty string", async (_label, name) => {
            signUpEmail.mockResolvedValue({
                data: { user: makeAuthUser({ name }) },
                error: null,
            });

            const result = await registerUser(registerInput);

            expect(result.name).toBe("");
        });

        it("preserves an empty-string name as-is", async () => {
            signUpEmail.mockResolvedValue({
                data: { user: makeAuthUser({ name: "" }) },
                error: null,
            });

            expect((await registerUser(registerInput)).name).toBe("");
        });
    });

    describe("duplicate account handling", () => {
        it.each([
            "USER_ALREADY_EXISTS",
            "EMAIL_ALREADY_EXISTS",
            "user_already_exists",
            "email_already_exists",
            "AUTH_USER_ALREADY_EXISTS_V2",
        ])("throws ConflictError for provider code %s", async (code) => {
            signUpEmail.mockResolvedValue({
                data: null,
                error: { code, message: "boom" },
            });

            const promise = registerUser(registerInput);

            await expect(promise).rejects.toBeInstanceOf(ConflictError);
            await expect(promise).rejects.toThrow(
                "An account with this email already exists",
            );
        });
    });

    describe("other provider errors", () => {
        it("maps unknown error codes to a generic AppError", async () => {
            signUpEmail.mockResolvedValue({
                data: null,
                error: {
                    code: "PASSWORD_TOO_SHORT",
                    message: "Password too short",
                },
            });

            const promise = registerUser(registerInput);

            await expect(promise).rejects.toBeInstanceOf(AppError);
            await expect(promise).rejects.toThrow(
                "We could not create your account",
            );
            await expect(promise).rejects.not.toBeInstanceOf(ConflictError);
        });

        it("does not leak the provider's internal message to the caller", async () => {
            signUpEmail.mockResolvedValue({
                data: null,
                error: {
                    code: "DB_DOWN",
                    message: "connection to 10.0.0.5:5432 refused",
                },
            });

            const promise = registerUser(registerInput);

            await expect(promise).rejects.not.toThrow(/10\.0\.0\.5|refused/);
        });

        it.each([
            ["missing code", { message: "no code here" }],
            ["null code", { code: null }],
            ["string error", "something went wrong"],
            ["empty object", {}],
        ])(
            "falls back to the generic AppError when the error has a %s",
            async (_label, error) => {
                signUpEmail.mockResolvedValue({ data: null, error });

                const promise = registerUser(registerInput);

                await expect(promise).rejects.toBeInstanceOf(AppError);
                await expect(promise).rejects.not.toBeInstanceOf(ConflictError);
            },
        );

        it("stringifies non-string codes safely (numeric code)", async () => {
            signUpEmail.mockResolvedValue({ data: null, error: { code: 500 } });

            await expect(registerUser(registerInput)).rejects.toBeInstanceOf(
                AppError,
            );
        });

        it("prefers the error branch even if data is also present", async () => {
            signUpEmail.mockResolvedValue({
                data: { user: makeAuthUser() },
                error: { code: "SOMETHING_ELSE" },
            });

            await expect(registerUser(registerInput)).rejects.toBeInstanceOf(
                AppError,
            );
        });
    });

    describe("malformed provider responses", () => {
        it.each([
            ["data is null", { data: null, error: null }],
            ["data is undefined", { data: undefined, error: null }],
            ["data has no user", { data: {}, error: null }],
            ["user is null", { data: { user: null }, error: null }],
        ])("throws a plain Error when %s", async (_label, response) => {
            signUpEmail.mockResolvedValue(response);

            const promise = registerUser(registerInput);

            await expect(promise).rejects.toThrow(
                "Neon Auth created the account without returning a user",
            );
            // This is an unexpected/internal failure, it should surface as a 500.
            await expect(promise).rejects.not.toBeInstanceOf(AppError);
        });
    });

    describe("infrastructure failures", () => {
        it("propagates rejections from the SDK (network error, timeout, ...)", async () => {
            const networkError = new Error("ECONNRESET");
            signUpEmail.mockRejectedValue(networkError);

            await expect(registerUser(registerInput)).rejects.toBe(
                networkError,
            );
        });
    });
});

describe("verifyCredentials", () => {
    const email = "jane@example.com";
    const password = "S3cure-passw0rd!";

    describe("happy path", () => {
        it("calls Neon Auth signIn with the supplied email and password", async () => {
            signInEmail.mockResolvedValue({
                data: { user: makeAuthUser() },
                error: null,
            });

            await verifyCredentials(email, password);

            expect(signInEmail).toHaveBeenCalledTimes(1);
            expect(signInEmail).toHaveBeenCalledWith({ email, password });
        });

        it("returns the mapped public user on success", async () => {
            signInEmail.mockResolvedValue({
                data: { user: makeAuthUser() },
                error: null,
            });

            const result = await verifyCredentials(email, password);

            expect(result).toEqual({
                id: "user_123",
                email: "jane@example.com",
                name: "Jane Doe",
                createdAt: "2024-06-01T08:30:00.000Z",
            });
        });

        it("applies the same normalisation rules as registration (null name, missing createdAt)", async () => {
            signInEmail.mockResolvedValue({
                data: {
                    user: makeAuthUser({ name: null, createdAt: undefined }),
                },
                error: null,
            });

            const result = await verifyCredentials(email, password);

            expect(result).toMatchObject({
                name: "",
                createdAt: NOW.toISOString(),
            });
        });

        it("does not echo the password or other sensitive provider fields", async () => {
            signInEmail.mockResolvedValue({
                data: {
                    user: makeAuthUser({ passwordHash: "hash", token: "jwt" }),
                },
                error: null,
            });

            const result = await verifyCredentials(email, password);

            expect(Object.keys(result!).sort()).toEqual([
                "createdAt",
                "email",
                "id",
                "name",
            ]);
            expect(JSON.stringify(result)).not.toContain(password);
        });
    });

    describe("failed authentication returns null (never throws)", () => {
        it.each([
            [
                "invalid credentials",
                { data: null, error: { code: "INVALID_EMAIL_OR_PASSWORD" } },
            ],
            ["unknown user", { data: null, error: { code: "USER_NOT_FOUND" } }],
            ["any error object", { data: null, error: { message: "nope" } }],
            [
                "error with data present",
                { data: { user: makeAuthUser() }, error: { code: "X" } },
            ],
            ["no data and no error", { data: null, error: null }],
            ["data without a user", { data: {}, error: null }],
            ["null user", { data: { user: null }, error: null }],
        ])("returns null for %s", async (_label, response) => {
            signInEmail.mockResolvedValue(response);

            await expect(
                verifyCredentials(email, password),
            ).resolves.toBeNull();
        });

        it("returns an identical result for unknown-user and wrong-password (no user enumeration)", async () => {
            signInEmail.mockResolvedValueOnce({
                data: null,
                error: { code: "USER_NOT_FOUND" },
            });
            const unknownUser = await verifyCredentials(email, password);

            signInEmail.mockResolvedValueOnce({
                data: null,
                error: { code: "INVALID_PASSWORD" },
            });
            const wrongPassword = await verifyCredentials(email, password);

            expect(unknownUser).toBe(wrongPassword);
        });
    });

    describe("infrastructure failures", () => {
        it("propagates SDK rejections instead of masking them as bad credentials", async () => {
            const outage = new Error("Neon Auth unreachable");
            signInEmail.mockRejectedValue(outage);

            await expect(verifyCredentials(email, password)).rejects.toBe(
                outage,
            );
        });
    });
});
