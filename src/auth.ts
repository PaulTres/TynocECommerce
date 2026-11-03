import { authConfig } from "@/auth.config";
import {
    checkIdentifierRateLimit,
    checkSubmitRateLimit,
} from "@/lib/api/rate-limit";
import { loginSchema } from "@/lib/validation/schemas";
import { verifyCredentials } from "@/services/auth.service";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { RateLimitedError } from "./lib/errors";

/**
 * Legacy Auth.js shim, no longer mounted by the app's route handlers.
 * Public sign-in and registration use Neon Managed Auth through lib/auth/server.
 *
 * `authorize` runs in this order, cheapest and least-informative checks first:
 *   1. IP rate limit  - before parsing or hitting the DB, so floods cost almost nothing
 *   2. zod validation - never trust the client
 *   3. email rate limit - stops distributed guessing against one account
 *   4. credential check through Neon Managed Auth
 *
 * Returning null makes Auth.js respond with a generic "CredentialsSignin" error,
 * which avoids revealing whether the email exists.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            credentials: { email: {}, password: {} },
            async authorize(raw, request) {
                //per-IP rate limiting
                const ipLimit = await checkSubmitRateLimit(request, "login");
                if (!ipLimit.allowed) throw new RateLimitedError();

                const parsed = loginSchema.safeParse(raw);
                if (!parsed.success) return null;

                //per-account limit, keyed on the submitted email, whether or not it actually exists
                const idLimit = await checkIdentifierRateLimit(
                    "login",
                    parsed.data.email,
                );
                if (!idLimit.allowed) throw new RateLimitedError();

                //credential verification; must do constant-time work even when the user does not exist to avoid user enumeration via timing.
                const user = await verifyCredentials(
                    parsed.data.email,
                    parsed.data.password,
                );
                return user
                    ? { id: user.id, email: user.email, name: user.name }
                    : null;
            },
        }),
    ],
});
