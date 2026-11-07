// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WishlistButton } from "./WishlistButton";

const actions = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
vi.mock("@/actions/wishlist", () => ({
    addToWishlistAction: actions.add,
    removeFromWishlistAction: actions.remove,
}));

describe("WishlistButton", () => {
    beforeEach(() => {
        actions.add.mockReset();
        actions.remove.mockReset();
    });

    it("adds an item and changes the accessible state", async () => {
        actions.add.mockResolvedValue({ ok: true, data: undefined });
        render(<WishlistButton productId="p1" initialWishlisted={false} />);
        const button = screen.getByRole("button", { name: "Add to wishlist" });
        fireEvent.click(button);
        expect(
            screen
                .getByRole("button", { name: "Remove from wishlist" })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        await waitFor(() => expect(actions.add).toHaveBeenCalledWith("p1"));
    });

    it("rolls back failed additions and removes an existing item", async () => {
        actions.add.mockResolvedValue({
            ok: false,
            error: { code: "FAIL", message: "Failed" },
        });
        const firstRender = render(
            <WishlistButton productId="p2" initialWishlisted={false} />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Add to wishlist" }),
        );
        await waitFor(() =>
            expect(
                screen
                    .getByRole("button", { name: "Add to wishlist" })
                    .getAttribute("aria-pressed"),
            ).toBe("false"),
        );
        actions.remove.mockResolvedValue({ ok: true, data: undefined });
        firstRender.unmount();
        render(<WishlistButton productId="p2" initialWishlisted />);
        fireEvent.click(
            screen.getByRole("button", { name: "Remove from wishlist" }),
        );
        await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("p2"));
    });
});
