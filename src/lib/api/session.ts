import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";

/** Returns the signed-in user's id or null (for pages that adapt to anonymous visitors). */
export async function getUserId(): Promise<string | null> {
    const session = await auth();
    return session?.user?.id ?? null;
}

/**
 * Returns the signed-in user's id or throws.
 * The user id always comes from the verified session, so one user cannot touch
 * another user's cart or wishlist.
 * @throws UnauthorizedError when there is no session.
 */
export async function requireUserId(): Promise<string> {
    const id = await getUserId();
    if (!id) throw new UnauthorizedError();
    return id;
}
