import { createInternalNeonAuth } from "@neondatabase/auth";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import {
    createAuthServer,
    type RequestContextFactory,
} from "@neondatabase/auth/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is required");
if (!cookieSecret || cookieSecret.length < 32)
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters");

const authBaseUrl: string = baseUrl;
const authCookieSecret: string = cookieSecret;

/** Server-side Neon Managed Auth client. Neon owns credentials and sessions. */
export const auth = createNeonAuth({
    baseUrl: authBaseUrl,
    cookies: { secret: authCookieSecret },
});

/** Mints short-lived anonymous JWTs for public, RLS-protected Data API reads. */
export const anonymousAuth = createInternalNeonAuth(authBaseUrl, {
    allowAnonymous: true,
});

/** Creates a Neon server client with the supplied request context. */
export function createReadOnlyAuth(context: RequestContextFactory) {
    return createAuthServer({
        baseUrl: authBaseUrl,
        cookieSecret: authCookieSecret,
        context,
    });
}
