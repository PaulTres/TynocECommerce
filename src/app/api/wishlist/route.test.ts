import { readJson } from "@/lib/api/handler";
import { requireUserId } from "@/lib/api/session";
import { AppError, UnauthorizedError, ValidationError } from "@/lib/errors";
import * as wishlistService from "@/services/wishlist.service";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/lib/api/handler", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api/handler")>();

    return {
        ...actual,
        readJson: vi.fn(),
    };
});

vi.mock("@/lib/api/session", () => ({
    requireUserId: vi.fn(),
}));

vi.mock("@/services/wishlist.service", () => ({
    getWishlist: vi.fn(),
    addToWishlist: vi.fn(),
}));

const mockedRequireUserId = vi.mocked(requireUserId);
const mockedReadJson = vi.mocked(readJson);
const mockedGetWishlist = vi.mocked(wishlistService.getWishlist);
const mockedAddToWishlist = vi.mocked(wishlistService.addToWishlist);

describe("Wishlist API routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GET", () => {
        it("should return the user's wishlist with status 200", async () => {
            const userId = "user-123";
            const items = [
                { id: "product-1", name: "Product 1" },
                { id: "product-2", name: "Product 2" },
            ];

            mockedRequireUserId.mockResolvedValue(userId);
            mockedGetWishlist.mockResolvedValue(items as never);

            const response = await GET();

            expect(response).toBeInstanceOf(NextResponse);
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ items });

            expect(mockedRequireUserId).toHaveBeenCalledOnce();
            expect(mockedGetWishlist).toHaveBeenCalledWith(userId);
        });

        it("should return an empty wishlist when the user has no items", async () => {
            mockedRequireUserId.mockResolvedValue("user-123");
            mockedGetWishlist.mockResolvedValue([]);

            const response = await GET();

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ items: [] });
        });

        it("should include private, no-store cache headers", async () => {
            mockedRequireUserId.mockResolvedValue("user-123");
            mockedGetWishlist.mockResolvedValue([]);

            const response = await GET();

            expect(response.headers.get("Cache-Control")).toBe(
                "private, no-store",
            );
        });

        it("should propagate authentication errors", async () => {
            mockedRequireUserId.mockRejectedValue(new UnauthorizedError());

            const response = await GET();

            expect(response.status).toBe(401);
            expect(mockedGetWishlist).not.toHaveBeenCalled();
        });

        it("should handle wishlist service errors", async () => {
            mockedRequireUserId.mockResolvedValue("user-123");
            mockedGetWishlist.mockRejectedValue(
                new AppError("Database error", 500, "error"),
            );

            const response = await GET();

            expect(response.status).toBe(500);
        });
    });

    describe("POST", () => {
        const userId = "user-123";
        const productId = "product-123";

        const createRequest = () =>
            new Request("http://localhost/api/wishlist", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ productId }),
            });

        it("should add a product and return status 201 when created", async () => {
            mockedRequireUserId.mockResolvedValue(userId);
            mockedReadJson.mockResolvedValue({ productId });
            mockedAddToWishlist.mockResolvedValue(true);

            const response = await POST(createRequest());

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
                productId,
                created: true,
            });

            expect(mockedRequireUserId).toHaveBeenCalledOnce();
            expect(mockedReadJson).toHaveBeenCalledOnce();
            expect(mockedAddToWishlist).toHaveBeenCalledWith(userId, productId);
        });

        it("should return status 200 when the product is already in the wishlist", async () => {
            mockedRequireUserId.mockResolvedValue(userId);
            mockedReadJson.mockResolvedValue({ productId });
            mockedAddToWishlist.mockResolvedValue(false);

            const response = await POST(createRequest());

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                productId,
                created: false,
            });
        });

        it("should return a validation error for an empty productId", async () => {
            mockedRequireUserId.mockResolvedValue(userId);
            mockedReadJson.mockResolvedValue({ productId: "" });

            const response = await POST(createRequest());

            expect(response.status).toBe(400);
            expect(mockedAddToWishlist).not.toHaveBeenCalled();
        });

        it("should return a validation error when productId is missing", async () => {
            mockedRequireUserId.mockResolvedValue(userId);
            mockedReadJson.mockResolvedValue({});

            const response = await POST(createRequest());

            expect(response.status).toBe(400);
            expect(mockedAddToWishlist).not.toHaveBeenCalled();
        });

        it("should propagate authentication errors", async () => {
            mockedRequireUserId.mockRejectedValue(new UnauthorizedError());

            const response = await POST(createRequest());

            expect(response.status).toBe(401);
            expect(mockedReadJson).not.toHaveBeenCalled();
            expect(mockedAddToWishlist).not.toHaveBeenCalled();
        });

        it("should handle JSON parsing errors", async () => {
            mockedRequireUserId.mockResolvedValue(userId);
            mockedReadJson.mockRejectedValue(new ValidationError());

            const response = await POST(createRequest());

            expect(response.status).toBe(400);
            expect(mockedAddToWishlist).not.toHaveBeenCalled();
        });

        it("should handle wishlist service errors", async () => {
            mockedRequireUserId.mockResolvedValue(userId);
            mockedReadJson.mockResolvedValue({ productId });
            mockedAddToWishlist.mockRejectedValue(
                new AppError("Database error", 500, "boom"),
            );

            const response = await POST(createRequest());

            expect(response.status).toBe(500);
        });
    });
});
