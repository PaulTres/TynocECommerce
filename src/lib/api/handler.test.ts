import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppError, RateLimitedError } from "@/lib/errors";
import { errorResponse, readJson, withErrors } from "./handler";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("errorResponse", () => {

    it("returns the correct response for an AppError", async () => {
        const error = new AppError("NOT_FOUND", 404, "Resource not found");

        const response = errorResponse(error);

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            error: {
                code: "NOT_FOUND",
                message: "Resource not found",
            },
        });

        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("returns validation errors for a ZodError", async () => {
        const schema = z.object({
            email: z.string().email(),
            name: z.string().min(3),
        });

        const result = schema.safeParse({
            email: "invalid-email",
            name: "A",
        });

        expect(result.success).toBe(false);

        if (result.success) {
            throw new Error("Expected schema validation to fail");
        }

        const response = errorResponse(result.error);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: {
                code: "VALIDATION_ERROR",
                message: "Invalid input",
                fieldErrors: {
                    email: expect.any(Array),
                    name: expect.any(Array),
                },
            },
        });

        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("returns the correct response for a RateLimitedError", async () => {
        const error = new RateLimitedError();

        const response = errorResponse(error);

        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({
            error: {
                code: error.code,
                message: "Too many attempts. Try again in a few minutes.",
            },
        });

        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("returns a generic 500 response for unexpected errors", async () => {
        const error = new Error("Sensitive database connection details");

        const response = errorResponse(error);

        expect(response.status).toBe(500);
        const body = await response.clone().text();
        expect(body).not.toContain("Sensitive database connection details");

        expect(await response.json()).toEqual({
            error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong. Please try again.",
            },
        });

        expect(consoleErrorSpy).toHaveBeenCalledOnce();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "[api] unexpected error",
            error,
        );
    });

    it.each([
        null,
        undefined,
        "unexpected string",
        123,
        { message: "Sensitive information" },
    ])("handles unexpected thrown values: %s", async (err) => {
        const response = errorResponse(err);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong. Please try again.",
            },
        });

        expect(consoleErrorSpy).toHaveBeenCalledOnce();
    });
});

describe("withErrors", () => {
    it("returns the handler response when the handler succeeds", async () => {
        const originalResponse = NextResponse.json(
            { success: true },
            { status: 200 },
        );

        const handler = vi.fn().mockResolvedValue(originalResponse);

        const wrappedHandler = withErrors(handler);

        const response = await wrappedHandler();

        expect(response).toBe(originalResponse);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });

        expect(handler).toHaveBeenCalledOnce();
    });

    /**
     * Verifies that handler arguments are forwarded unchanged.
     */
    it("forwards arguments to the original handler", async () => {
        const request = new Request("http://localhost/api/test");
        const context = { params: Promise.resolve({ id: "123" }) };

        const handler = vi
            .fn()
            .mockResolvedValue(NextResponse.json({ success: true }));

        const wrappedHandler = withErrors(handler);

        await wrappedHandler(request, context);

        expect(handler).toHaveBeenCalledWith(request, context);
    });

    /**
     * Ensures thrown AppErrors are converted into HTTP responses.
     */
    it("converts handler AppErrors into error responses", async () => {
        const error = new AppError("NOT_FOUND", 404, "User not found");

        const handler = vi.fn().mockRejectedValue(error);

        const wrappedHandler = withErrors(handler);

        const response = await wrappedHandler();

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            error: {
                code: "NOT_FOUND",
                message: "User not found",
            },
        });
    });

    /**
     * Ensures unexpected handler errors never propagate to the caller.
     */
    it("converts unexpected handler errors into HTTP 500 responses", async () => {
        const handler = vi
            .fn()
            .mockRejectedValue(new Error("Internal failure"));

        const wrappedHandler = withErrors(handler);

        await expect(wrappedHandler()).resolves.toBeInstanceOf(Response);

        const response = await wrappedHandler();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong. Please try again.",
            },
        });
    });
});

describe("readJson", () => {
    /**
     * Verifies that valid JSON request bodies are parsed correctly.
     */
    it("returns the parsed JSON body", async () => {
        const body = {
            name: "John",
            email: "john@example.com",
        };

        const request = new Request("http://localhost/api/test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        await expect(readJson(request)).resolves.toEqual(body);
    });

    /**
     * Ensures malformed JSON is converted into a validation AppError.
     */
    it("throws a validation AppError when the JSON body is malformed", async () => {
        const request = new Request("http://localhost/api/test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: "{ invalid json",
        });

        await expect(readJson(request)).rejects.toMatchObject({
            code: "VALIDATION_ERROR",
            status: 400,
            message: "Request body must be valid JSON",
        });
    });

    /**
     * Verifies that an empty request body is treated as invalid JSON.
     */
    it("throws a validation AppError when the request body is empty", async () => {
        const request = new Request("http://localhost/api/test", {
            method: "POST",
            body: "",
        });

        await expect(readJson(request)).rejects.toMatchObject({
            code: "VALIDATION_ERROR",
            status: 400,
            message: "Request body must be valid JSON",
        });
    });

    /**
     * Ensures valid JSON primitives are returned without modification.
     */
    it.each([null, "hello", 123, true, [1, 2, 3]])(
        "accepts valid JSON values: %s",
        async (value) => {
            const request = new Request("http://localhost/api/test", {
                method: "POST",
                body: JSON.stringify(value),
            });

            await expect(readJson(request)).resolves.toEqual(value);
        },
    );
});
