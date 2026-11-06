import { AppError } from "@/lib/errors";
import type { FormState } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    checkSubmitRateLimitMock,
    checkIdentifierRateLimitMock,
    tooManyAttemptsMessageMock,
    authMock,
    safeRedirectPathMock,
    loginSchemaMock,
    registerSchemaMock,
    registerUserMock,
    verifyCredentialsMock,
    headersMock,
    redirectMock,
} = vi.hoisted(() => ({
    checkSubmitRateLimitMock: vi.fn(),
    checkIdentifierRateLimitMock: vi.fn(),
    tooManyAttemptsMessageMock: vi.fn(),
    authMock: {
        getSession: vi.fn(),
        signOut: vi.fn(),
    },
    safeRedirectPathMock: vi.fn(),
    loginSchemaMock: {
        safeParse: vi.fn(),
    },
    registerSchemaMock: {
        safeParse: vi.fn(),
    },
    registerUserMock: vi.fn(),
    verifyCredentialsMock: vi.fn(),
    headersMock: vi.fn(),
    redirectMock: vi.fn(),
}));

vi.mock("@/lib/api/rate-limit", () => ({
    checkSubmitRateLimit: checkSubmitRateLimitMock,
    checkIdentifierRateLimit: checkIdentifierRateLimitMock,
    tooManyAttemptsMessage: tooManyAttemptsMessageMock,
}));

vi.mock("@/lib/auth/server", () => ({
    auth: authMock,
}));

vi.mock("@/lib/utils", () => ({
    safeRedirectPath: safeRedirectPathMock,
}));

vi.mock("@/lib/validation/schemas", () => ({
    loginSchema: loginSchemaMock,
    registerSchema: registerSchemaMock,
}));

vi.mock("@/services/auth.service", () => ({
    registerUser: registerUserMock,
    verifyCredentials: verifyCredentialsMock,
}));

vi.mock("next/headers", () => ({
    headers: headersMock,
}));

vi.mock("next/navigation", () => ({
    redirect: redirectMock,
}));

// Import after defining mocks.
import { loginAction, logoutAction, registerAction } from "./auth";

const mockHeaders = new Headers({
    "x-real-ip": "192.168.1.10",
});

const validLoginData = {
    email: "test@example.com",
    password: "Password123!",
};

const validRegisterData = {
    name: "Test User",
    email: "test@example.com",
    password: "Password123!",
};

const validLoginResult = {
    success: true,
    data: validLoginData,
};

const validRegisterResult = {
    success: true,
    data: validRegisterData,
};

function createFormData(values: Record<string, string>): FormData {
    const formData = new FormData();

    for (const [key, value] of Object.entries(values)) {
        formData.set(key, value);
    }

    return formData;
}

function createValidationError(fieldErrors: Record<string, string[]>) {
    return {
        success: false,
        error: {
            flatten: () => ({
                fieldErrors,
            }),
        },
    };
}

function createRateLimitResult(allowed = true) {
    return {
        allowed,
        retryAfterSeconds: 60,
    };
}

beforeEach(() => {
    vi.clearAllMocks();

    headersMock.mockResolvedValue(mockHeaders);

    checkSubmitRateLimitMock.mockResolvedValue(createRateLimitResult());

    checkIdentifierRateLimitMock.mockResolvedValue(createRateLimitResult());

    tooManyAttemptsMessageMock.mockImplementation(
        (seconds: number) => `Too many attempts. Retry in ${seconds}s.`,
    );

    safeRedirectPathMock.mockImplementation((path?: string) => path || "/");

    loginSchemaMock.safeParse.mockReturnValue(validLoginResult);

    registerSchemaMock.safeParse.mockReturnValue(validRegisterResult);

    verifyCredentialsMock.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
    });

    registerUserMock.mockResolvedValue(undefined);
    authMock.getSession.mockResolvedValue({
        data: {
            user: {
                id: "user-123",
            },
        },
    });

    authMock.signOut.mockResolvedValue(undefined);

    redirectMock.mockImplementation((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    });
});

describe("loginAction", () => {
    it("checks the IP rate limit before validating credentials", async () => {
        verifyCredentialsMock.mockResolvedValue(null);

        const formData = createFormData(validLoginData);

        const result = await loginAction({} as FormState, formData);

        expect(checkSubmitRateLimitMock).toHaveBeenCalledWith(
            { headers: mockHeaders },
            "login",
        );

        expect(loginSchemaMock.safeParse).toHaveBeenCalled();
        expect(result).toEqual({
            error: "Incorrect email or password",
        });
    });

    it("returns an error when the IP rate limit is exceeded", async () => {
        checkSubmitRateLimitMock.mockResolvedValue(
            createRateLimitResult(false),
        );

        const formData = createFormData(validLoginData);

        const result = await loginAction({} as FormState, formData);

        expect(result).toEqual({
            error: "Too many attempts. Retry in 60s.",
        });

        expect(tooManyAttemptsMessageMock).toHaveBeenCalledWith(60);
        expect(loginSchemaMock.safeParse).not.toHaveBeenCalled();
        expect(checkIdentifierRateLimitMock).not.toHaveBeenCalled();
        expect(verifyCredentialsMock).not.toHaveBeenCalled();
    });

    it("returns field errors when validation fails", async () => {
        const fieldErrors = {
            email: ["Invalid email"],
            password: ["Password is required"],
        };

        loginSchemaMock.safeParse.mockReturnValue(
            createValidationError(fieldErrors),
        );

        const result = await loginAction(
            {} as FormState,
            createFormData(validLoginData),
        );

        expect(result).toEqual({ fieldErrors });

        expect(checkIdentifierRateLimitMock).not.toHaveBeenCalled();
        expect(verifyCredentialsMock).not.toHaveBeenCalled();
    });

    it("returns an error when the identifier rate limit is exceeded", async () => {
        checkIdentifierRateLimitMock.mockResolvedValue(
            createRateLimitResult(false),
        );

        const result = await loginAction(
            {} as FormState,
            createFormData(validLoginData),
        );

        expect(checkIdentifierRateLimitMock).toHaveBeenCalledWith(
            "login",
            validLoginData.email,
        );

        expect(result).toEqual({
            error: "Too many attempts. Retry in 60s.",
        });

        expect(verifyCredentialsMock).not.toHaveBeenCalled();
    });

    it("verifies credentials and redirects to the callback URL", async () => {
        safeRedirectPathMock.mockReturnValue("/dashboard");

        const formData = createFormData({
            ...validLoginData,
            callbackUrl: "/dashboard",
        });

        await expect(loginAction({} as FormState, formData)).rejects.toThrow(
            "NEXT_REDIRECT:/dashboard",
        );

        expect(verifyCredentialsMock).toHaveBeenCalledWith(
            validLoginData.email,
            validLoginData.password,
        );

        expect(safeRedirectPathMock).toHaveBeenCalledWith("/dashboard");

        expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    });

    it("uses the default safe redirect path when callbackUrl is missing", async () => {
        safeRedirectPathMock.mockReturnValue("/");

        const formData = createFormData(validLoginData);

        await expect(loginAction({} as FormState, formData)).rejects.toThrow(
            "NEXT_REDIRECT:/",
        );

        expect(safeRedirectPathMock).toHaveBeenCalledWith(undefined);
        expect(redirectMock).toHaveBeenCalledWith("/");
    });

    it("returns an error when credentials are incorrect", async () => {
        verifyCredentialsMock.mockResolvedValue(null);

        const result = await loginAction(
            {} as FormState,
            createFormData(validLoginData),
        );

        expect(result).toEqual({
            error: "Incorrect email or password",
        });

        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a generic error when credential verification throws", async () => {
        verifyCredentialsMock.mockRejectedValue(
            new Error("Neon Auth unavailable"),
        );

        const result = await loginAction(
            {} as FormState,
            createFormData(validLoginData),
        );

        expect(result).toEqual({
            error: "We could not sign you in. Please try again.",
        });

        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("does not catch redirect errors as authentication errors", async () => {
        const formData = createFormData(validLoginData);

        await expect(loginAction({} as FormState, formData)).rejects.toThrow(
            "NEXT_REDIRECT:/",
        );

        expect(verifyCredentialsMock).toHaveBeenCalled();
    });
});

describe("registerAction", () => {
    it("checks the IP rate limit before validating registration data", async () => {
        authMock.getSession.mockResolvedValue({
            data: null,
        });

        const formData = createFormData(validRegisterData);

        const result = await registerAction({} as FormState, formData);

        expect(checkSubmitRateLimitMock).toHaveBeenCalledWith(
            { headers: mockHeaders },
            "register",
        );

        expect(registerSchemaMock.safeParse).toHaveBeenCalled();

        expect(result).toEqual({
            success: "Your account was created. You can sign in now.",
        });
    });

    it("returns an error when the IP rate limit is exceeded", async () => {
        checkSubmitRateLimitMock.mockResolvedValue(
            createRateLimitResult(false),
        );

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({
            error: "Too many attempts. Retry in 60s.",
        });

        expect(registerSchemaMock.safeParse).not.toHaveBeenCalled();
        expect(checkIdentifierRateLimitMock).not.toHaveBeenCalled();
        expect(registerUserMock).not.toHaveBeenCalled();
    });

    it("returns field errors when registration validation fails", async () => {
        const fieldErrors = {
            email: ["Invalid email"],
            password: ["Password is too weak"],
        };

        registerSchemaMock.safeParse.mockReturnValue(
            createValidationError(fieldErrors),
        );

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({ fieldErrors });

        expect(checkIdentifierRateLimitMock).not.toHaveBeenCalled();
        expect(registerUserMock).not.toHaveBeenCalled();
    });

    it("returns an error when the identifier rate limit is exceeded", async () => {
        checkIdentifierRateLimitMock.mockResolvedValue(
            createRateLimitResult(false),
        );

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(checkIdentifierRateLimitMock).toHaveBeenCalledWith(
            "register",
            validRegisterData.email,
        );

        expect(result).toEqual({
            error: "Too many attempts. Retry in 60s.",
        });

        expect(registerUserMock).not.toHaveBeenCalled();
    });

    it("registers the user and redirects when a session exists", async () => {
        safeRedirectPathMock.mockReturnValue("/dashboard");

        const formData = createFormData({
            ...validRegisterData,
            callbackUrl: "/dashboard",
        });

        await expect(registerAction({} as FormState, formData)).rejects.toThrow(
            "NEXT_REDIRECT:/dashboard",
        );

        expect(registerUserMock).toHaveBeenCalledWith(validRegisterData);

        expect(authMock.getSession).toHaveBeenCalledOnce();

        expect(safeRedirectPathMock).toHaveBeenCalledWith("/dashboard");

        expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    });

    it("returns a success message when registration succeeds without a session", async () => {
        authMock.getSession.mockResolvedValue({
            data: {
                session: null,
            },
        });

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({
            success: "Your account was created. You can sign in now.",
        });

        expect(registerUserMock).toHaveBeenCalledOnce();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a success message when the session has no user", async () => {
        authMock.getSession.mockResolvedValue({
            data: {
                session: {},
            },
        });

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({
            success: "Your account was created. You can sign in now.",
        });

        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a generic error when the email already exists", async () => {
        registerUserMock.mockRejectedValue(
            new AppError(
                "An account with this email already exists",
                409,
                "CONFLICT",
            ),
        );

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({
            error: "We could not create your account. Please try again.",
        });

        expect(authMock.getSession).not.toHaveBeenCalled();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a generic error when account creation fails", async () => {
        registerUserMock.mockRejectedValue(new Error("Database unavailable"));

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({
            error: "We could not create your account. Please try again.",
        });

        expect(authMock.getSession).not.toHaveBeenCalled();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a generic error for AppError instances other than CONFLICT", async () => {
        registerUserMock.mockRejectedValue(
            new AppError("Unexpected application error", 500, "INTERNAL"),
        );

        const result = await registerAction(
            {} as FormState,
            createFormData(validRegisterData),
        );

        expect(result).toEqual({
            error: "We could not create your account. Please try again.",
        });
    });
});

describe("logoutAction", () => {
    it("signs out the user and redirects to the homepage", async () => {
        await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");

        expect(authMock.signOut).toHaveBeenCalledOnce();
        expect(redirectMock).toHaveBeenCalledWith("/");
    });

    it("does not redirect when sign out fails", async () => {
        authMock.signOut.mockRejectedValue(new Error("Sign out failed"));

        await expect(logoutAction()).rejects.toThrow("Sign out failed");

        expect(redirectMock).not.toHaveBeenCalled();
    });
});
