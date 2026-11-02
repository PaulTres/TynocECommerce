"use server";

import { signIn, signOut } from "@/auth";
import { AppError, RATE_LIMITED_CODE } from "@/lib/errors";
import {
    checkIdentifierRateLimit,
    checkSubmitRateLimit,
} from "@/lib/api/rate-limit"; // adjust to wherever rate-limit.ts lives
import { safeRedirectPath } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import { registerUser } from "@/services/auth.service";
import { AuthError } from "next-auth";
import { headers } from "next/headers";

/** State shape consumed by useActionState in the auth forms. */
export interface FormState {
    error?: string;
    fieldErrors?: Record<string, string[] | undefined>;
}


/**
 * Turns a retry delay into a short user-facing message.
 * Rounds up to whole minutes once it exceeds a minute so the text stays readable
 * ("Try again in 14 minutes" instead of "in 837 seconds").
 */
function tooManyAttemptsMessage(retryAfterSeconds: number): string {
    const wait =
        retryAfterSeconds < 60
            ? `${retryAfterSeconds} seconds`
            : `${Math.ceil(retryAfterSeconds / 60)} minutes`;
    return `Too many attempts. Please try again in ${wait}.`;
}

/**
 * True when an Auth.js error came from our RateLimitedError (thrown in `authorize`).
 * Checked via the `code` property rather than `instanceof`, because Auth.js may
 * rebuild the error on its way out of signIn() and the subclass would be lost.
 */
function isRateLimitedAuthError(err: AuthError): boolean {
    return (err as AuthError & { code?: string }).code === RATE_LIMITED_CODE;
}

/**
 * Handles the login form.
 * Validates, then calls Auth.js signIn() which sets the session cookie and throws a
 * redirect on success (that special error must be re-thrown). Bad credentials produce a single
 * generic message so attackers cannot tell whether an email exists.
 *
 * Rate limiting is deliberately not done here: it lives in `authorize` (auth.ts),
 * because the Auth.js endpoint /api/auth/callback/credentials is publicly callable
 * and would bypass this action. Checking in both places would also spend two
 * tokens per attempt. This action only translates the resulting error.
 */
export async function loginAction(
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    const parsed = loginSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { fieldErrors: parsed.error.flatten().fieldErrors };
    const redirectTo = safeRedirectPath(
        formData.get("callbackUrl")?.toString(),
    );
    try {
        await signIn("credentials", { ...parsed.data, redirectTo });
    } catch (err) {
        if (err instanceof AuthError) {
            // Tell the user to slow down, but keep every other failure generic.
            if (isRateLimitedAuthError(err))
                return {
                    error: "Too many login attempts. Please wait a few minutes and try again.",
                };
            return { error: "Incorrect email or password" };
        }
        throw err; // includes Next.js' NEXT_REDIRECT - must propagate
    }
    return {};
}

/**
 * Handles the registration form:
 * rate limit (IP) -> validate -> rate limit (email) -> create account -> sign in.
 *
 * Unlike login, register is only reachable through this action, so the limit is
 * enforced here. The IP check runs first so floods are rejected before any
 * parsing or database work; malformed submissions count against the limit too.
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

    // 5. Sign the new user in. This was previously unguarded: if signIn() threw an
    //    AuthError (e.g. the login limiter tripped), the user got a 500 even though
    //    the account had just been created. Now they get a clear next step instead.
    try {
        await signIn("credentials", {
            email: parsed.data.email,
            password: parsed.data.password,
            redirectTo: safeRedirectPath(
                formData.get("callbackUrl")?.toString(),
            ),
        });
    } catch (err) {
        if (err instanceof AuthError)
            return {
                error: "Your account was created, but we could not sign you in automatically. Please log in.",
            };
        throw err; // NEXT_REDIRECT on success must propagate
    }
    return {};
}

/** Signs the user out and returns to the homepage. */
export async function logoutAction(): Promise<void> {
    await signOut({ redirectTo: "/" });
}