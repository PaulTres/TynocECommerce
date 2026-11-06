import { readJson, withErrors } from "@/lib/api/handler";
import {
    checkIdentifierRateLimit,
    checkSubmitRateLimit
} from "@/lib/api/rate-limit";
import { rateLimitedResponse } from "@/lib/utils";
import { registerSchema } from "@/lib/validation/schemas";
import { registerUser } from "@/services/auth.service";
import { NextResponse } from "next/server";

/**
 * POST /api/auth/register - creates an account (JSON API twin of the register form action).
 * Responses: 201 {user} | 400 validation | 409 email taken.
 */
export const POST = withErrors(async (req: Request) => {
    const ipLimit = await checkSubmitRateLimit(
        { headers: req.headers },
        "register",
    );
    if (!ipLimit.allowed) return rateLimitedResponse(ipLimit);
    const input = registerSchema.parse(await readJson(req));
    const identifierLimit = await checkIdentifierRateLimit(
        "register",
        input.email,
    );
    if (!identifierLimit.allowed) return rateLimitedResponse(identifierLimit);
    const user = await registerUser(input);
    return NextResponse.json({ user }, { status: 201 });
});
