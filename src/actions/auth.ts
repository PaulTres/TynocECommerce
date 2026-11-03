"use server";

import {
    checkIdentifierRateLimit,
    checkSubmitRateLimit,
    tooManyAttemptsMessage,
} from "@/lib/api/rate-limit";
import { AppError } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import { registerUser, verifyCredentials } from "@/services/auth.service";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

/** State shape consumed by useActionState in the auth forms. */
export interface FormState {
    error?: string;
    success?: string;
    fieldErrors?: Record<string, string[] | undefined>;
}

/**
 * Uses Neon Managed Auth to validate credentials and set its HTTP-only session
 * cookie. The page action is rate limited, and the public Neon auth proxy is too.
 */
export async function loginAction(
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    const ipLimit = await checkSubmitRateLimit(
        { headers: await headers() },
        "login",
    );
    if (!ipLimit.allowed)
        return { error: tooManyAttemptsMessage(ipLimit.retryAfterSeconds) };

    const parsed = loginSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { fieldErrors: parsed.error.flatten().fieldErrors };
    const redirectTo = safeRedirectPath(
        formData.get("callbackUrl")?.toString(),
    );
    const idLimit = await checkIdentifierRateLimit("login", parsed.data.email);
    if (!idLimit.allowed)
        return { error: tooManyAttemptsMessage(idLimit.retryAfterSeconds) };

    try {
        const user = await verifyCredentials(parsed.data.email, parsed.data.password);
        if (!user) return { error: "Incorrect email or password" };
    } catch (err) {
        console.error("[login] Neon Auth request failed", err);
        return { error: "We could not sign you in. Please try again." };
    }
    redirect(redirectTo);
}

/**
 * Handles the registration form:
 * rate limit (IP) -> validate -> rate limit (email) -> create account.
 *
 * The IP check runs first so floods are rejected before parsing or database
 * work; malformed submissions count against the limit too. The Neon Auth API
 * proxy and JSON registration route apply the same limits.
 * Duplicate emails surface as a field error (see notes about enumeration).
 */
export async function registerAction(
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    // 1. Per-IP limits (global + per-form).
    const ipLimit = await checkSubmitRateLimit(
        { headers: await headers() },
        "register",
    );
    if (!ipLimit.allowed)
        return { error: tooManyAttemptsMessage(ipLimit.retryAfterSeconds) };

    // 2. Server-side validation.
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { fieldErrors: parsed.error.flatten().fieldErrors };

    // 3. Per-email limit: stops one address being hammered from many IPs
    //    (sign-up spam / probing for already-registered emails).
    const idLimit = await checkIdentifierRateLimit(
        "register",
        parsed.data.email,
    );
    if (!idLimit.allowed)
        return { error: tooManyAttemptsMessage(idLimit.retryAfterSeconds) };

    // 4. Create the account.
    try {
        await registerUser(parsed.data);
    } catch (err) {
        if (err instanceof AppError && err.code === "CONFLICT")
            return { fieldErrors: { email: [err.message] } };
        console.error("[register] failed", err);
        return { error: "We could not create your account. Please try again." };
    }

    const { data: session } = await auth.getSession();
    if (!session?.user)
        return {
            success: "Your account was created. You can sign in now.",
        };
    redirect(safeRedirectPath(formData.get("callbackUrl")?.toString()));
}

/** Signs the user out and returns to the homepage. */
export async function logoutAction(): Promise<void> {
    await auth.signOut();
    redirect("/");
}
