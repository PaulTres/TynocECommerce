// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddToCartForm } from "./AddToCartForm";

const mocks = vi.hoisted(() => ({ add: vi.fn(), push: vi.fn() }));
vi.mock("@/actions/cart", () => ({ addToCartAction: mocks.add }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("AddToCartForm", () => {
    it("renders a disabled out-of-stock state", () => {
        render(<AddToCartForm productId="p1" maxQuantity={0} signedIn />);
        expect((screen.getByRole("button", { name: "Out of stock" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByLabelText("Quantity")).toBeNull();
    });

    it("redirects unsigned customers with an encoded callback path", () => {
        window.history.pushState({}, "", "/products/linen?ref=home");
        render(<AddToCartForm productId="linen" maxQuantity={3} signedIn={false} />);
        fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
        expect(mocks.push).toHaveBeenCalledWith("/login?callbackUrl=%2Fproducts%2Flinen");
    });

    it("submits the chosen quantity and presents the action result", async () => {
        mocks.add.mockResolvedValueOnce({ ok: true, data: undefined }).mockResolvedValueOnce({ ok: false, error: { message: "Out of stock" } });
        render(<AddToCartForm productId="linen" maxQuantity={3} signedIn />);
        fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
        fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
        await waitFor(() => expect(mocks.add).toHaveBeenCalledWith({ productId: "linen", quantity: 2 }));
        expect((await screen.findByRole("status")).textContent).toContain("Added to your cart");
        fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
        expect((await screen.findByRole("status")).textContent).toContain("Out of stock");
    });
});
