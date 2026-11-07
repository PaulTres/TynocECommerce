import { describe, expect, it } from "vitest";
import {
    AppError,
    ConflictError,
    NotFoundError,
    RateLimitedError,
    RATE_LIMITED_CODE,
    UnauthorizedError,
    ValidationError,
} from "./errors";

describe("application errors", () => {
    it("preserves the supplied AppError fields and native Error behavior", () => {
        const details = { field: "email" };
        const error = new AppError("CUSTOM", 418, "custom failure", details);

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("AppError");
        expect(error.message).toBe("custom failure");
        expect(error.code).toBe("CUSTOM");
        expect(error.status).toBe(418);
        expect(error.details).toBe(details);
    });

    it.each([
        [new ValidationError(), "ValidationError", "VALIDATION_ERROR", 400, "Invalid input"],
        [new UnauthorizedError(), "UnauthorizedError", "UNAUTHORIZED", 401, "You need to sign in to do that"],
        [new NotFoundError(), "NotFoundError", "NOT_FOUND", 404, "Not found"],
        [new ConflictError(), "ConflictError", "CONFLICT", 409, "Conflict"],
    ])("sets the standard shape for %s", (error, name, code, status, message) => {
        expect(error).toBeInstanceOf(AppError);
        expect(error.name).toBe(name);
        expect(error.code).toBe(code);
        expect(error.status).toBe(status);
        expect(error.message).toBe(message);
    });

    it("supports custom validation text and details", () => {
        const error = new ValidationError("Bad email", { email: "invalid" });
        expect(error.message).toBe("Bad email");
        expect(error.details).toEqual({ email: "invalid" });
    });

    it("uses the shared rate limit code and supports a custom message", () => {
        const error = new RateLimitedError("Try later");
        expect(RATE_LIMITED_CODE).toBe("rate_limited");
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("RateLimitedError");
        expect(error.code).toBe(RATE_LIMITED_CODE);
        expect(error.status).toBe(429);
        expect(error.message).toBe("Try later");
    });
});
