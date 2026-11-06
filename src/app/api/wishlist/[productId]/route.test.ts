import { requireUserId } from "@/lib/api/session";
import { AppError } from "@/lib/errors";
import * as wishlistService from "@/services/wishlist.service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

// Mock dependencies.
vi.mock("@/lib/api/session", () => ({
    requireUserId: vi.fn(),
}));

vi.mock("@/services/wishlist.service", () => ({
    removeFromWishlist: vi.fn(),
}));

describe("DELETE /api/wishlist/:productId", () => {
    const userId = "user-123";
    const productId = "product-123";

    /** Creates a mock Next.js route context containing the product ID. */
    const createContext = (id: string) => ({
        params: Promise.resolve({ productId: id }),
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should remove a product from the wishlist and return 204", async () => {
        vi.mocked(requireUserId).mockResolvedValue(userId);
        vi.mocked(wishlistService.removeFromWishlist).mockResolvedValue(
            undefined,
        );

        const response = await DELETE(
            new Request(`http://localhost/api/wishlist/${productId}`, {
                method: "DELETE",
            }),
            createContext(productId),
        );

        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");

        expect(requireUserId).toHaveBeenCalledOnce();
        expect(wishlistService.removeFromWishlist).toHaveBeenCalledOnce();
        expect(wishlistService.removeFromWishlist).toHaveBeenCalledWith(
            userId,
            productId,
        );
    });

    it("should propagate authentication errors", async () => {
        vi.mocked(requireUserId).mockRejectedValue(
            new AppError("Unauthorized", 403, "Unauthorized"),
        );

        const response = await DELETE(
            new Request(`http://localhost/api/wishlist/${productId}`, {
                method: "DELETE",
            }),
            createContext(productId),
        );

        expect(response.status).toBe(403);
        expect(wishlistService.removeFromWishlist).not.toHaveBeenCalled();
    });

    it("should reject an invalid product ID", async () => {
        vi.mocked(requireUserId).mockResolvedValue(userId);

        const invalidProductId = "";
        const response = await DELETE(
            new Request(`http://localhost/api/wishlist/${invalidProductId}`, {
                method: "DELETE",
            }),
            createContext(invalidProductId), //empty string is invalid as product id
        );

        expect(response.status).toBe(400);

        expect(wishlistService.removeFromWishlist).not.toHaveBeenCalled();
    });

    it("should propagate wishlist service errors", async () => {
        vi.mocked(requireUserId).mockResolvedValue(userId);

        vi.mocked(wishlistService.removeFromWishlist).mockRejectedValue(
            new AppError(
                "Wishlist removal failed",
                500,
                "Wishlist removal failed",
            ),
        );

        const response = await DELETE(
            new Request(`http://localhost/api/wishlist/${productId}`, {
                method: "DELETE",
            }),
            createContext(productId),
        );

        expect(response.status).toBe(500);

        expect(wishlistService.removeFromWishlist).toHaveBeenCalledWith(
            userId,
            productId,
        );
    });
});
