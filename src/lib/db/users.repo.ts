import { dataApi } from "./data-api";

const MISSING_AUTH_CLAIMS_MESSAGE =
    "An authenticated Neon Auth Data API token is required";

async function readOrCreateAppUser(): Promise<string> {
    const rows = await dataApi<{ id: string }[]>("rpc/get_or_create_app_user", {
        access: "authenticated",
        method: "POST",
        body: {},
    });
    if (rows[0]?.id) return String(rows[0].id);

    throw new Error(
        "Neon returned no app user mapping. Apply prisma/app-user-mapping.sql with pnpm run db:app-user.",
    );
}

/**
 * Returns or creates the app's opaque internal user key for the subject in the
 * authenticated Neon Auth JWT. The database is the identity source, so the
 * session lookup and Data API token cannot disagree about which user to map.
 * Neon can transiently omit JWT claims in an authenticated Data API RPC; retry
 * that exact failure once because this mapping operation is idempotent.
 */
export async function getOrCreateAppUser(): Promise<string> {
    try {
        return await readOrCreateAppUser();
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !error.message.includes(MISSING_AUTH_CLAIMS_MESSAGE)
        ) {
            throw error;
        }
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
    return readOrCreateAppUser();
}
