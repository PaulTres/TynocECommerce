"use server";

import {
    checkIdentifierRateLimit,
    checkSubmitRateLimit,
} from "@/lib/api/rate-limit";
import { auth } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { safeRedirectPath, tooManyAttemptsMessage } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import { registerUser, verifyCredentials } from "@/services/auth.service";
import { FormState } from "@/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
        const user = await verifyCredentials(
            parsed.data.email,
            parsed.data.password,
        );
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
 * The IP check runs first so floods are rejected before parsing or database
 * work; malformed submissions count against the limit too. The Neon Auth API
 * proxy and JSON registration route apply the same limits.
 * Duplicate emails surface as a field error.
 */
export async function registerAction(
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    //per-IP limits
    const ipLimit = await checkSubmitRateLimit(
        { headers: await headers() },
        "register",
    );
    if (!ipLimit.allowed)
        return { error: tooManyAttemptsMessage(ipLimit.retryAfterSeconds) };

    //server-side validation.
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { fieldErrors: parsed.error.flatten().fieldErrors };

    //per-email limit
    const idLimit = await checkIdentifierRateLimit(
        "register",
        parsed.data.email,
    );
    if (!idLimit.allowed)
        return { error: tooManyAttemptsMessage(idLimit.retryAfterSeconds) };

    //account creation
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
