/* eslint-disable @typescript-eslint/no-explicit-any*/
import { describe, expect, it, vi } from "vitest";
import CartPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({ userId: vi.fn(), getCart: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ requireUserId: mocks.userId }));
vi.mock("@/services/cart.service", () => ({ getCart: mocks.getCart }));
vi.mock("@/components/EmptyState", () => ({
    EmptyState: (props: unknown) => props,
}));
vi.mock("@/components/CartLineItem", () => ({
    CartLineItem: (props: unknown) => props,
}));

describe("CartPage", () => {
    it("shows an empty-cart prompt", async () => {
        mocks.userId.mockResolvedValue("u1");
        mocks.getCart.mockResolvedValue({
            lines: [],
            itemCount: 0,
            subtotalCents: 0,
            currency: "USD",
        });
        const result = (await CartPage()) as any;
        expect(mocks.getCart).toHaveBeenCalledWith("u1");
        expect(result.props.title).toBe("Your cart is empty");
        expect(result.props.actionLabel).toBe("Start shopping");
    });

    it("renders rows, subtotal and stock-aware checkout title", async () => {
        const cart = {
            lines: [{ product: { id: "p1" }, exceedsStock: true }],
            itemCount: 2,
            subtotalCents: 2500,
            currency: "USD",
        };
        mocks.userId.mockResolvedValue("u2");
        mocks.getCart.mockResolvedValue(cart);
        const result = (await CartPage()) as any;
        const [section, aside] = result.props.children;
        expect(section.props.children[1].props.children[0].props.line).toBe(
            cart.lines[0],
        );
        expect(
            aside.props.children[1].props.children[0].props.children.join(""),
        ).toBe("Subtotal (2 items)");
        const checkout = aside.props.children[3];
        expect(checkout.props.disabled).toBe(true);
        expect(checkout.props.title).toBe("Fix stock issues first");
    });

    it("sets the cart title", () => {
        expect(metadata).toEqual({ title: "Your cart" });
    });
});
