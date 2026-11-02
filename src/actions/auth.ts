"use server";

import { signIn, signOut } from "@/auth";
import { AppError } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import { registerUser } from "@/services/auth.service";
import { AuthError } from "next-auth";

/** State shape consumed by useActionState in the auth forms. */
export interface FormState {
    error?: string;
    fieldErrors?: Record<string, string[] | undefined>;
}

/**
 * Handles the login form.
 * Validates, then calls Auth.js signIn() which sets the session cookie and throws a
 * redirect on success (that special error must be re-thrown). Bad credentials produce a single
 * generic message so attackers cannot tell whether an email exists.
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
        if (err instanceof AuthError)
            return { error: "Incorrect email or password" };
        throw err; // includes Next.js' NEXT_REDIRECT - must propagate
    }
    return {};
}

/**
 * Handles the registration form: validate -> create account -> sign the user in.
 * Duplicate emails surface as a field error.
 */
export async function registerAction(
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { fieldErrors: parsed.error.flatten().fieldErrors };
    try {
        await registerUser(parsed.data);
    } catch (err) {
        if (err instanceof AppError && err.code === "CONFLICT")
            return { fieldErrors: { email: [err.message] } };
        console.error("[register] failed", err);
        return { error: "We could not create your account. Please try again." };
    }
    await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirectTo: safeRedirectPath(formData.get("callbackUrl")?.toString()),
    });
    return {};
}

/** Signs the user out and returns to the homepage. */
export async function logoutAction(): Promise<void> {
    await signOut({ redirectTo: "/" });
}
