import {
    MISSING_AUTH_CLAIMS_MESSAGE,
    MISSING_MAPPING_MESSAGE,
} from "../constants";
import { dataApi } from "./data-api";

async function readOrCreateAppUser(): Promise<string> {
    const rows = await dataApi<{ id: string }[]>("rpc/get_or_create_app_user", {
        access: "authenticated",
        method: "POST",
        body: {},
    });
    if (rows[0]?.id) return String(rows[0].id);

    throw new Error(MISSING_MAPPING_MESSAGE);
}

/**
 * Returns or creates the app's opaque internal user key for the subject in the
 * authenticated Neon Auth JWT.
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
