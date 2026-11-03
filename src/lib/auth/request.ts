import { extractNeonAuthCookies } from "@neondatabase/auth/server";
import { headers } from "next/headers";
import "server-only";
import { createReadOnlyAuth } from "@/lib/auth/server";

/** Reads the current Neon session without modifying response cookies. */
export async function getRequestAuth() {
    const requestHeaders = await headers();
    const cookieHeader = extractNeonAuthCookies(
        requestHeaders,
    );
    if (!cookieHeader) return null;

    return createReadOnlyAuth(() => ({
        getCookies: () => cookieHeader,
        // Server Component renders cannot commit Set-Cookie headers.
        setCookie: () => {},
        getHeader: (name) => requestHeaders.get(name),
        getOrigin: () =>
            requestHeaders.get("origin") ??
            requestHeaders.get("referer")?.split("/").slice(0, 3).join("/") ??
            "",
        getFramework: () => "nextjs",
    }));
}
