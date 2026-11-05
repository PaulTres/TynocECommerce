import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";

import { AppError } from "@/lib/errors";
import { runAction } from "./action";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("runAction", () => {
    describe("successful execution", () => {
        it("returns the result when the function resolves successfully", async () => {
            const fn = vi
                .fn()
                .mockResolvedValue({ id: "123", name: "Product" });

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: true,
                data: { id: "123", name: "Product" },
            });
            expect(fn).toHaveBeenCalledOnce();
        });

        it("returns undefined when the function resolves without a value", async () => {
            const fn = vi.fn().mockResolvedValue(undefined);

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: true,
                data: undefined,
            });
        });
    });

    describe("Zod validation errors", () => {
        it("returns a validation error with field errors", async () => {
            const schema = z.object({
                name: z.string().min(1),
                price: z.number().positive(),
            });

            const parsed = schema.safeParse({
                name: "",
                price: -10,
            });

            if (parsed.success) {
                throw new Error("Expected validation to fail");
            }

            const fn = vi.fn().mockRejectedValue(parsed.error);

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Please check your input",
                    fieldErrors: {
                        //specific messages vary between Zod versions
                        name: expect.any(Array),
                        price: expect.any(Array),
                    },
                },
            });
        });

        it("returns an empty fieldErrors object for errors without field-level issues", async () => {
            const error = new ZodError([]);

            const fn = vi.fn().mockRejectedValue(error);

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Please check your input",
                    fieldErrors: {},
                },
            });
        });

        it("does not log validation errors", async () => {
            const schema = z.object({
                name: z.string(),
            });

            const parsed = schema.safeParse({ name: 123 });

            if (parsed.success) {
                throw new Error("Expected validation to fail");
            }

            const fn = vi.fn().mockRejectedValue(parsed.error);

            await runAction(fn);

            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });
    });

    describe("AppError handling", () => {
        it("returns the custom error code and message", async () => {
            const error = new AppError("NOT_FOUND", 404, "Product not found");

            const fn = vi.fn().mockRejectedValue(error);

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        });

        it("does not log AppError instances", async () => {
            const fn = vi
                .fn()
                .mockRejectedValue(
                    new AppError("FORBIDDEN", 403, "Access denied"),
                );

            await runAction(fn);

            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });
    });

    describe("unexpected errors", () => {
        it("returns a generic internal error for unexpected exceptions", async () => {
            const fn = vi
                .fn()
                .mockRejectedValue(new Error("Database connection failed"));

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Something went wrong. Please try again.",
                },
            });
        });

        it("logs unexpected errors to console.error", async () => {
            const error = new Error("Unexpected failure");
            const fn = vi.fn().mockRejectedValue(error);

            await runAction(fn);

            expect(consoleErrorSpy).toHaveBeenCalledOnce();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "[action] unexpected error",
                error,
            );
        });

        it("handles thrown strings", async () => {
            const fn = vi.fn().mockRejectedValue("Something went wrong");

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Something went wrong. Please try again.",
                },
            });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "[action] unexpected error",
                "Something went wrong",
            );
        });

        it("handles null errors", async () => {
            const fn = vi.fn().mockRejectedValue(null);

            const result = await runAction(fn);

            expect(result).toEqual({
                ok: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Something went wrong. Please try again.",
                },
            });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "[action] unexpected error",
                null,
            );
        });
    });
});
