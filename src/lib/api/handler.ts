import { AppError, RateLimitedError } from "@/lib/errors";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Converts any thrown value into the uniform JSON error envelope { error: { code, message } }.
 * - AppError  -> its own status (400/401/404/409)
 * - ZodError  -> 400 with per-field messages
 * - anything else -> logged server-side, generic 500 (never leak stack traces or AWS details)
 */
export function errorResponse(err: unknown): NextResponse {
    if (err instanceof ZodError) {
        return NextResponse.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid input",
                    fieldErrors: err.flatten().fieldErrors,
                },
            },
            { status: 400 },
        );
    }
    if (err instanceof RateLimitedError) {
        return NextResponse.json(
            {
                error: {
                    code: err.code,
                    message: "Too many attempts. Try again in a few minutes.",
                },
            },
            { status: 429 },
        );
    }
    if (err instanceof AppError) {
        return NextResponse.json(
            { error: { code: err.code, message: err.message } },
            { status: err.status },
        );
    }
    console.error("[api] unexpected error", err);
    return NextResponse.json(
        {
            error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong. Please try again.",
            },
        },
        { status: 500 },
    );
}

/**
 * Wraps a Route Handler so it never throws: success returns the handler's response,
 * failure goes through errorResponse(). Keeps each route file focused on its happy path.
 */
export function withErrors<A extends unknown[]>(
    handler: (...args: A) => Promise<Response>,
) {
    return async (...args: A): Promise<Response> => {
        try {
            return await handler(...args);
        } catch (err) {
            return errorResponse(err);
        }
    };
}

/** Reads a JSON body, turning malformed JSON into a 400 instead of an unhandled exception. */
export async function readJson(req: Request): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        throw new AppError(
            "VALIDATION_ERROR",
            400,
            "Request body must be valid JSON",
        );
    }
}

/** Typed context for dynamic routes (Next 15 passes `params` as a Promise). */
export type RouteContext<P> = { params: Promise<P> };
