/**
 * Typed application errors. Services throw these; the API/action layer maps them
 * to HTTP status codes or ActionResult values. This keeps business logic free of
 * HTTP concerns and guarantees consistent error payloads.
 */
export class AppError extends Error {
    constructor(
        public readonly code: string,
        public readonly status: number,
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class ValidationError extends AppError {
    constructor(message = "Invalid input", details?: unknown) {
        super("VALIDATION_ERROR", 400, message, details);
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = "You need to sign in to do that") {
        super("UNAUTHORIZED", 401, message);
    }
}
export class NotFoundError extends AppError {
    constructor(message = "Not found") {
        super("NOT_FOUND", 404, message);
    }
}
export class ConflictError extends AppError {
    constructor(message = "Conflict") {
        super("CONFLICT", 409, message);
    }
}


export const RATE_LIMITED_CODE = "rate_limited";
/**
 * Thrown when a login attempt is rate limited.
 */
export class RateLimitedError extends Error {
    readonly code = RATE_LIMITED_CODE;
    readonly status = 429;

    constructor(message = "Too many attempts. Try again in a few minutes.") {
        super(message);
        this.name = "RateLimitedError";
    }
}
