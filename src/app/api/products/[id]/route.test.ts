import { AppError } from "@/lib/errors";
import { productIdSchema } from "@/lib/validation/schemas";
import { getProductDetail } from "@/services/product.service";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// Mock external dependencies to isolate the route handler.
vi.mock("@/services/product.service", () => ({
    getProductDetail: vi.fn(),
}));

describe("GET /api/products/:id", () => {
    const mockProductDetail = {
        product: {
            id: "product-123",
            name: "Test Product",
            price: 99.99,
        },
        category: {
            id: "category-123",
            name: "Electronics",
        },
        related: [],
    };

    // Reset mocks before each test to prevent state leaking between tests.
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return product details with status 200", async () => {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        vi.mocked(getProductDetail).mockResolvedValue(mockProductDetail as any);

        const response = await GET(
            new Request("http://localhost/api/products/product-123"),
            { params: Promise.resolve({ id: "product-123" }) },
        );

        const body = await response.json();

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(200);
        expect(body).toEqual(mockProductDetail);
        expect(getProductDetail).toHaveBeenCalledOnce();
        expect(getProductDetail).toHaveBeenCalledWith("product-123");
    });

    it("should reject an invalid product ID", async () => {
        const invalidId = "invalid/id!";

        const response = await GET(
            new Request(`http://localhost/api/products/${invalidId}`),
            {
                params: Promise.resolve({ id: invalidId }),
            },
        );

        expect(response.status).toBe(400);
        expect(getProductDetail).not.toHaveBeenCalled();
    });

    it("should reject an empty product ID", async () => {
        const response = await GET(
            new Request("http://localhost/api/products/"),
            {
                params: Promise.resolve({ id: "" }),
            },
        );

        expect(response.status).toBe(400);
        expect(getProductDetail).not.toHaveBeenCalled();
    });

    it("should pass the validated product ID to the service", async () => {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        vi.mocked(getProductDetail).mockResolvedValue(mockProductDetail as any);

        const validId = "valid-product-123";

        await GET(new Request(`http://localhost/api/products/${validId}`), {
            params: Promise.resolve({ id: validId }),
        });

        expect(productIdSchema.safeParse(validId).success).toBe(true);
        expect(getProductDetail).toHaveBeenCalledWith(validId);
    });

    it("should propagate service errors", async () => {
        const serviceError = new AppError(
            "Database connection failed",
            500,
            "kaboom",
        );

        vi.mocked(getProductDetail).mockRejectedValue(serviceError);

        const response = await GET(
            new Request("http://localhost/api/products/product-123"),
            {
                params: Promise.resolve({ id: "product-123" }),
            },
        );
        expect(response.status).toBe(500);

        expect(getProductDetail).toHaveBeenCalledWith("product-123");
    });
});
