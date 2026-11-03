import { auth } from "@/lib/auth/server";
import {
    checkIdentifierRateLimit,
    checkSubmitRateLimit,
    tooManyAttemptsMessage,
} from "@/lib/api/rate-limit";
import { NextResponse } from "next/server";

const handlers = auth.handler();

function rateLimitedResponse(retryAfterSeconds: number, headers: Record<string, string>) {
    return NextResponse.json(
        {
            error: {
                code: "RATE_LIMITED",
                message: tooManyAttemptsMessage(retryAfterSeconds),
            },
        },
        { status: 429, headers },
    );
}

/**
 * The Neon Auth proxy is public by design. Keep the app's IP and identifier
 * throttles in front of the email sign-in/sign-up endpoints as well as forms.
 */
async function guardEmailAuth(request: Request): Promise<Response | null> {
    if (request.method !== "POST") return null;
    const path = new URL(request.url).pathname;
    const operation = path.endsWith("/sign-in/email")
        ? "login"
        : path.endsWith("/sign-up/email")
          ? "register"
          : null;
    if (!operation) return null;

    const ipLimit = await checkSubmitRateLimit({ headers: request.headers }, operation);
    if (!ipLimit.allowed)
        return rateLimitedResponse(ipLimit.retryAfterSeconds, ipLimit.headers);

    try {
        const body = (await request.clone().json()) as { email?: unknown };
        if (typeof body.email === "string" && body.email.trim()) {
            const identifierLimit = await checkIdentifierRateLimit(operation, body.email);
            if (!identifierLimit.allowed)
                return rateLimitedResponse(
                    identifierLimit.retryAfterSeconds,
                    identifierLimit.headers,
                );
        }
    } catch {
        // Neon Auth returns the normal validation error for malformed JSON.
    }
    return null;
}

export const GET = handlers.GET;

export const POST: typeof handlers.POST = async (...args) => {
    const blocked = await guardEmailAuth(args[0]);
    return blocked ?? handlers.POST(...args);
};
