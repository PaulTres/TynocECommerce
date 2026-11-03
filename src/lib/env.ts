import { z } from "zod";

const schema = z.object({
    NEON_DATA_API_URL: z.string().url(),
    NEON_AUTH_BASE_URL: z.string().url(),
    NEON_AUTH_COOKIE_SECRET: z
        .string()
        .min(32, "NEON_AUTH_COOKIE_SECRET must be at least 32 characters"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/**
 * Parses and caches environment variables.
 */
export function getEnv(): Env {
    if (cached) return cached;
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
        const problems = parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
        );
        throw new Error(
            `Invalid environment configuration -> ${problems.join("; ")}`,
        );
    }
    cached = parsed.data;
    return cached;
}
