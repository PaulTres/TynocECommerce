import type { NextAuthConfig } from "next-auth";

/** Routes that require a signed-in user. Everything else is public. */
const PROTECTED_PREFIXES = ["/cart", "/wishlist"];

/** Edge-safe Auth.js config (no database or bcrypt imports).*/
export const authConfig = {
    pages: { signIn: "/login" },
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // stateless sessions, 7 days
    providers: [], // real providers are added in auth.ts
    callbacks: {
        /** Middleware gate: unauthenticated users hitting a protected page are redirected to /login. */
        authorized({ auth, request }) {
            const path = request.nextUrl.pathname;
            const isProtected = PROTECTED_PREFIXES.some(
                (p) => path === p || path.startsWith(`${p}/`),
            );
            return isProtected ? Boolean(auth?.user) : true;
        },
        /** Copies the user id into the JWT on sign-in (Auth.js stores it in `sub`). */
        jwt({ token, user }) {
            if (user?.id) token.sub = user.id;
            return token;
        },
        /** Exposes the id on `session.user.id` for server code. */
        session({ session, token }) {
            if (token.sub) session.user.id = token.sub;
            return session;
        },
    },
} satisfies NextAuthConfig;
