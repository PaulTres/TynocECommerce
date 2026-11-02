import { z } from "zod";

const schema = z.object({
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z
        .string()
        .min(32, "AUTH_SECRET must be at least 32 characters"),
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
