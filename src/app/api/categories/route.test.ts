import { getCategories } from "@/services/product.service";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// Mock the product service to isolate the route handler.
vi.mock("@/services/product.service", () => ({
    getCategories: vi.fn(),
}));

// Mock withErrors so we can test the route's actual response independently
// of the shared error-handling implementation.
vi.mock("@/lib/api/handler", () => ({
    withErrors: (handler: () => Promise<NextResponse>) => handler,
}));

const getCategoriesMock = vi.mocked(getCategories);

describe("GET /api/categories", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns categories in the expected JSON structure", async () => {
        const categories = [
            {
                id: "electronics",
                name: "Electronics",
                description: "electrifying",
                imageUrl: "image-goes-here",
                slug: "funny-snail",
            },
            {
                id: "clothing",
                name: "Clothing",
                description: "comfy",
                imageUrl: "image-goes-here",
                slug: "funny-snail",
            },
        ];

        getCategoriesMock.mockResolvedValue(categories);

        const response = await GET();
        const body = await response.json();

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(200);
        expect(body).toEqual({ items: categories });
    });

    it("returns an empty array when no categories exist", async () => {
        getCategoriesMock.mockResolvedValue([]);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ items: [] });
    });

    it("sets the correct Cache-Control header", async () => {
        getCategoriesMock.mockResolvedValue([]);

        const response = await GET();

        expect(response.headers.get("Cache-Control")).toBe(
            "public, s-maxage=300",
        );
    });

    it("calls getCategories exactly once", async () => {
        getCategoriesMock.mockResolvedValue([]);

        await GET();

        expect(getCategoriesMock).toHaveBeenCalledTimes(1);
        expect(getCategoriesMock).toHaveBeenCalledWith();
    });

    it("propagates errors from getCategories when using the actual handler", async () => {
        const error = new Error("Database connection failed");

        getCategoriesMock.mockRejectedValue(error);

        await expect(GET()).rejects.toThrow("Database connection failed");
    });
});
