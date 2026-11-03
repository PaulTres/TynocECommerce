import { cache } from "react";
import { getRequestAuth } from "@/lib/auth/request";
import { getOrCreateAppUser } from "@/lib/db/users.repo";
import { UnauthorizedError } from "@/lib/errors";

/** Returns the app's opaque user id or null for anonymous visitors. */
export const getUserId = cache(async (): Promise<string | null> => {
    const requestAuth = await getRequestAuth();
    if (!requestAuth) return null;

    const { data: session } = await requestAuth.getSession({
        query: { disableCookieCache: "true" },
    });
    return session?.user ? getOrCreateAppUser() : null;
});

/**
 * Returns the app's opaque user id or throws. Cart and wishlist repositories
 * also pass the Neon JWT so PostgreSQL RLS independently checks row ownership.
 * @throws UnauthorizedError when there is no session.
 */
export async function requireUserId(): Promise<string> {
    const id = await getUserId();
    if (!id) throw new UnauthorizedError();
    return id;
}
