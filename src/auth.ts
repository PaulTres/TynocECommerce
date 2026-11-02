import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/validation/schemas";
import { verifyCredentials } from "@/services/auth.service";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Full Auth.js setup (Node runtime): email + password via the credentials provider.
 * `authorize` re-validates input with zod (never trust the client), then asks the auth service.
 * Returning null makes Auth.js respond with a generic "CredentialsSignin" error.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            credentials: { email: {}, password: {} },
            async authorize(raw) {
                const parsed = loginSchema.safeParse(raw);
                if (!parsed.success) return null;
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
