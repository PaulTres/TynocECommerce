import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/types";
import { ZodError } from "zod";

/**
 * Runs a Server Action body and converts the outcome to an ActionResult.
 */
export async function runAction<T>(
    fn: () => Promise<T>,
): Promise<ActionResult<T>> {
    try {
        return { ok: true, data: await fn() };
    } catch (err) {
        if (err instanceof ZodError) {
            return {
                ok: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Please check your input",
                    fieldErrors: err.flatten().fieldErrors,
                },
            };
        }
        if (err instanceof AppError)
            return {
                ok: false,
                error: { code: err.code, message: err.message },
            };
        console.error("[action] unexpected error", err);
        return {
            ok: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong. Please try again.",
            },
        };
    }
}
