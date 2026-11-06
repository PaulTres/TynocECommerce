import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRequestAuth } from "@/lib/auth/request";
import { getOrCreateAppUser } from "@/lib/db/users.repo";
import { UnauthorizedError } from "@/lib/errors";

import { getUserDisplayName, getUserId, requireUserId } from "./session";

vi.mock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();

    return {
        ...actual,
        cache: (fn: (...args: never[]) => unknown) => fn,
    };
});

vi.mock("@/lib/auth/request", () => ({
    getRequestAuth: vi.fn(),
}));

vi.mock("@/lib/db/users.repo", () => ({
    getOrCreateAppUser: vi.fn(),
}));

const mockedGetRequestAuth = vi.mocked(getRequestAuth);
const mockedGetOrCreateAppUser = vi.mocked(getOrCreateAppUser);

const mockGetSession = vi.fn();

const mockRequestAuth = {
    getSession: mockGetSession,
};

describe("user", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Configures the authentication mock to return a session with the
     * supplied user identity.
     */
    function mockAuthenticatedUser(user: { name?: unknown; email?: unknown }) {
        mockedGetRequestAuth.mockResolvedValue(
            mockRequestAuth as unknown as Awaited<
                ReturnType<typeof getRequestAuth>
            >,
        );

        mockGetSession.mockResolvedValue({
            data: {
                session: {},
                user,
            },
        });
    }

    describe("getUserDisplayName", () => {
        it("returns the user's name when available", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            await expect(getUserDisplayName()).resolves.toBe("John Doe");
        });

        it("trims whitespace from the user's name", async () => {
            mockAuthenticatedUser({
                name: "  John Doe  ",
                email: "john@example.com",
            });

            await expect(getUserDisplayName()).resolves.toBe("John Doe");
        });

        it("falls back to email when the name is empty", async () => {
            mockAuthenticatedUser({
                name: "",
                email: "john@example.com",
            });

            await expect(getUserDisplayName()).resolves.toBe(
                "john@example.com",
            );
        });

        it("falls back to email when the name contains only whitespace", async () => {
            mockAuthenticatedUser({
                name: "   ",
                email: "john@example.com",
            });

            await expect(getUserDisplayName()).resolves.toBe(
                "john@example.com",
            );
        });

        it("returns null when both name and email are null", async () => {
            mockAuthenticatedUser({
                name: null,
                email: null,
            });

            await expect(getUserDisplayName()).resolves.toBeNull();
        });

        it("returns null when the user is anonymous", async () => {
            mockedGetRequestAuth.mockResolvedValue(null);

            await expect(getUserDisplayName()).resolves.toBeNull();
        });

        it("returns null when the session has no user", async () => {
            mockedGetRequestAuth.mockResolvedValue(
                mockRequestAuth as unknown as Awaited<
                    ReturnType<typeof getRequestAuth>
                >,
            );

            mockGetSession.mockResolvedValue({
                data: {
                    session: {},
                    user: null,
                },
            });

            await expect(getUserDisplayName()).resolves.toBeNull();
        });

        it("converts non-string name and email values to null", async () => {
            mockAuthenticatedUser({
                name: 123,
                email: 456,
            });

            await expect(getUserDisplayName()).resolves.toBeNull();
        });

        it("passes the expected options to getSession", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            await getUserDisplayName();

            expect(mockGetSession).toHaveBeenCalledWith({
                query: {
                    disableCookieCache: "true",
                },
            });
        });
    });

    describe("getUserId", () => {
        it("returns the app user ID for an authenticated user", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            mockedGetOrCreateAppUser.mockResolvedValue("app-user-123");

            await expect(getUserId()).resolves.toBe("app-user-123");
        });

        it("calls getOrCreateAppUser for an authenticated user", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            mockedGetOrCreateAppUser.mockResolvedValue("app-user-123");

            await getUserId();

            expect(mockedGetOrCreateAppUser).toHaveBeenCalledOnce();
        });

        it("does not call getOrCreateAppUser for anonymous visitors", async () => {
            mockedGetRequestAuth.mockResolvedValue(null);

            await expect(getUserId()).resolves.toBeNull();

            expect(mockedGetOrCreateAppUser).not.toHaveBeenCalled();
        });

        it("does not call getOrCreateAppUser when the session has no user", async () => {
            mockedGetRequestAuth.mockResolvedValue(
                mockRequestAuth as unknown as Awaited<
                    ReturnType<typeof getRequestAuth>
                >,
            );

            mockGetSession.mockResolvedValue({
                data: {
                    session: {},
                    user: null,
                },
            });

            await expect(getUserId()).resolves.toBeNull();

            expect(mockedGetOrCreateAppUser).not.toHaveBeenCalled();
        });

        it("propagates errors from getOrCreateAppUser", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            mockedGetOrCreateAppUser.mockRejectedValue(
                new Error("Database error"),
            );

            await expect(getUserId()).rejects.toThrow("Database error");
        });
    });

    describe("requireUserId", () => {
        it("returns the app user ID when authenticated", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            mockedGetOrCreateAppUser.mockResolvedValue("app-user-123");

            await expect(requireUserId()).resolves.toBe("app-user-123");
        });

        it("throws UnauthorizedError when the user is anonymous", async () => {
            mockedGetRequestAuth.mockResolvedValue(null);

            await expect(requireUserId()).rejects.toThrow(UnauthorizedError);
        });

        it("throws UnauthorizedError when the session has no user", async () => {
            mockedGetRequestAuth.mockResolvedValue(
                mockRequestAuth as unknown as Awaited<
                    ReturnType<typeof getRequestAuth>
                >,
            );

            mockGetSession.mockResolvedValue({
                data: {
                    session: {},
                    user: null,
                },
            });

            await expect(requireUserId()).rejects.toThrow(UnauthorizedError);
        });

        it("throws UnauthorizedError when getOrCreateAppUser returns null", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            mockedGetOrCreateAppUser.mockResolvedValue(null as never);

            await expect(requireUserId()).rejects.toThrow(UnauthorizedError);
        });

        it("throws UnauthorizedError when getOrCreateAppUser returns an empty string", async () => {
            mockAuthenticatedUser({
                name: "John Doe",
                email: "john@example.com",
            });

            mockedGetOrCreateAppUser.mockResolvedValue("" as never);

            await expect(requireUserId()).rejects.toThrow(UnauthorizedError);
        });
    });
});
