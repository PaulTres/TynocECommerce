import { getRequestAuth } from "@/lib/auth/request";
import { getOrCreateAppUser } from "@/lib/db/users.repo";
import { UnauthorizedError } from "@/lib/errors";
import { cache } from "react";

type AuthIdentity = {
    name: string | null;
    email: string | null;
};

/** Reads the signed-in provider identity once per server render. */
const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
    const requestAuth = await getRequestAuth();
    if (!requestAuth) return null;

    const { data: session } = await requestAuth.getSession({
        query: { disableCookieCache: "true" },
    });
    const user = session?.user;
    if (!user) return null;

    return {
        name: typeof user.name === "string" ? user.name : null,
        email: typeof user.email === "string" ? user.email : null,
    };
});

/** Returns the user's name for display, falling back to email if no name is set. */
export const getUserDisplayName = cache(async (): Promise<string | null> => {
    const identity = await getAuthIdentity();
    return identity?.name?.trim() || identity?.email || null;
});

/** Returns the app's opaque user id or null for anonymous visitors. */
export const getUserId = cache(async (): Promise<string | null> => {
    return (await getAuthIdentity()) ? getOrCreateAppUser() : null;
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
