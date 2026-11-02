import { z } from "zod";

/** Treats empty strings (common in .env files) as "not set". */
const optional = z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const schema = z.object({
    APP_AWS_REGION: z.string().min(1),
    APP_AWS_ACCESS_KEY_ID: optional,
    APP_AWS_SECRET_ACCESS_KEY: optional,
    DYNAMODB_TABLE_NAME: z.string().min(1),
    GSI1: z.string().min(1),
    GSI2: z.string().min(1),
    DYNAMODB_ENDPOINT: optional,
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
