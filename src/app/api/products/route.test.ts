import { searchProducts } from "@/services/product.service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/services/product.service", () => ({
    searchProducts: vi.fn(),
}));

describe("GET /api/products", () => {
    // Reset mocks before every test to prevent test interference.
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /** Creates a Request object with the supplied query parameters.*/
    const createRequest = (query = "") =>
        new Request(`http://localhost:3000/api/products${query}`);

    it("should return products successfully", async () => {
        const mockPage = {
            items: [{ id: "product-1", name: "Laptop" }],
            nextCursor: null,
        };

        vi.mocked(searchProducts).mockResolvedValue(mockPage as never);

        const response = await GET(createRequest());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(mockPage);

        expect(searchProducts).toHaveBeenCalledWith({
            search: undefined,
            categorySlug: undefined,
            minPriceCents: undefined,
            maxPriceCents: undefined,
            sort: "newest",
            limit: undefined,
            nextCursor: undefined,
            prevCursor: undefined,
        });
    });

    it("should map search and category parameters correctly", async () => {
        vi.mocked(searchProducts).mockResolvedValue({
            items: [],
            nextCursor: null,
        } as never);

        const response = await GET(
            createRequest("?q=laptop&category=electronics"),
        );

        expect(response.status).toBe(200);

        expect(searchProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                search: "laptop",
                categorySlug: "electronics",
            }),
        );
    });

    it("should convert minimum and maximum prices from dollars to cents", async () => {
        vi.mocked(searchProducts).mockResolvedValue({
            items: [],
            nextCursor: null,
        } as never);

        const response = await GET(createRequest("?min=10.50&max=99.99"));

        expect(response.status).toBe(200);

        expect(searchProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                minPriceCents: 1050,
                maxPriceCents: 9999,
            }),
        );
    });

    it("should round prices to the nearest cent", async () => {
        vi.mocked(searchProducts).mockResolvedValue({
            items: [],
            nextCursor: null,
        } as never);

        await GET(createRequest("?min=10.555&max=20.999"));

        expect(searchProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                minPriceCents: 1056,
                maxPriceCents: 2100,
            }),
        );
    });

    it("should pass sorting, limit, and cursor parameters", async () => {
        vi.mocked(searchProducts).mockResolvedValue({
            items: [],
            nextCursor: null,
        } as never);

        const response = await GET(
            createRequest("?sort=newest&limit=20&nextCursor=cursor-123"),
        );

        expect(response.status).toBe(200);

        expect(searchProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                sort: "newest",
                limit: 20,
                nextCursor: "cursor-123",
            }),
        );
    });

    it("should trim whitespace from the search query", async () => {
        vi.mocked(searchProducts).mockResolvedValue({
            items: [],
            nextCursor: null,
            prevCursor: null,
        } as never);

        await GET(createRequest("?q=%20laptop%20"));

        expect(searchProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                search: "laptop",
            }),
        );
    });

    it("should return the expected cache-control header", async () => {
        vi.mocked(searchProducts).mockResolvedValue({
            items: [],
            nextCursor: null,
        } as never);

        const response = await GET(createRequest());

        expect(response.headers.get("Cache-Control")).toBe(
            "public, s-maxage=60, stale-while-revalidate=300",
        );
    });

    it("should return a 400 response for invalid query parameters", async () => {
        const response = await GET(createRequest("?min=invalid"));

        expect(response.status).toBe(400);
        expect(searchProducts).not.toHaveBeenCalled();
    });

    it("should return a 400 response for an invalid category", async () => {
        const response = await GET(
            createRequest("?category=INVALID_CATEGORY!"),
        );

        expect(response.status).toBe(400);
        expect(searchProducts).not.toHaveBeenCalled();
    });

    it("should return a 400 response when limit is invalid", async () => {
        const response = await GET(createRequest("?limit=invalid"));

        expect(response.status).toBe(400);
        expect(searchProducts).not.toHaveBeenCalled();
    });

    it("should return a 400 response when minimum price exceeds maximum price", async () => {
        const response = await GET(createRequest("?min=100&max=50"));

        expect(response.status).toBe(400);
        expect(searchProducts).not.toHaveBeenCalled();
    });

    it("should handle service errors through withErrors", async () => {
        vi.mocked(searchProducts).mockRejectedValue(
            new Error("Database connection failed"),
        );

        const response = await GET(createRequest());

        expect(response.status).toBe(500);
    });
});
