// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any*/
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CartLineItem } from "./CartLineItem";

const actions = vi.hoisted(() => ({ remove: vi.fn(), update: vi.fn() }));
vi.mock("@/actions/cart", () => ({
    removeFromCartAction: actions.remove,
    updateCartQuantityAction: actions.update,
}));
vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("next/image", () => ({
    default: (props: any) => (
        <span data-testid="product-image" data-src={props.src} />
    ),
}));

const line = (quantity = 2, stock = 5, exceedsStock = false) => ({
    product: {
        id: "mug",
        name: "Ceramic mug",
        description: "",
        priceCents: 1200,
        currency: "USD",
        categorySlug: "home",
        images: [],
        stock,
        tags: [],
        featured: false,
        createdAt: "2026-01-01",
    },
    quantity,
    lineTotalCents: quantity * 1200,
    exceedsStock,
});

describe("CartLineItem", () => {
    it("renders product details", () => {
        render(<CartLineItem line={line(2, 3, false) as any} />);
        expect(
            screen
                .getByRole("link", { name: "Ceramic mug" })
                .getAttribute("href"),
        ).toBe("/products/mug");
        expect(
            screen.getByTestId("product-image").getAttribute("data-src"),
        ).toBe("/placeholder.svg");
        expect(
            screen.queryByText(
                "Only 3 in stock - reduce the quantity to continue.",
            ),
        ).toBeNull();
        expect(screen.getByText("$24.00")).toBeTruthy();
        expect(
            screen.getByLabelText("Increase quantity") as HTMLButtonElement,
        ).toBeTruthy();
        expect(
            (screen.getByLabelText("Increase quantity") as HTMLButtonElement)
                .disabled,
        ).not.toBe(true);
    });

    it("renders product details and stock issues", () => {
        render(<CartLineItem line={line(7, 3, true) as any} />);
        expect(
            screen
                .getByRole("link", { name: "Ceramic mug" })
                .getAttribute("href"),
        ).toBe("/products/mug");
        expect(
            screen.getByTestId("product-image").getAttribute("data-src"),
        ).toBe("/placeholder.svg");
        expect(
            screen.getByText(
                "Only 3 in stock - reduce the quantity to continue.",
            ),
        ).toBeTruthy();
        expect(screen.getByText("$84.00")).toBeTruthy();
        expect(
            (screen.getByLabelText("Increase quantity") as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it("updates quantities and removes the line", async () => {
        actions.update.mockResolvedValue({ ok: true, data: undefined });
        actions.remove.mockResolvedValue({
            ok: false,
            error: { message: "Could not remove" },
        });
        render(<CartLineItem line={line() as any} />);
        fireEvent.click(screen.getByLabelText("Increase quantity"));
        await waitFor(() =>
            expect(actions.update).toHaveBeenCalledWith({
                productId: "mug",
                quantity: 3,
            }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("mug"));
        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain(
            "Could not remove",
        );
    });

    // Decreasing from one delegates quantity zero so the server can remove the row.
    it("passes zero to the server when decreasing from one", async () => {
        actions.update.mockResolvedValue({ ok: true, data: undefined });
        render(<CartLineItem line={line(1, 5) as any} />);
        fireEvent.click(screen.getByLabelText("Decrease quantity"));
        await waitFor(() =>
            expect(actions.update).toHaveBeenCalledWith({
                productId: "mug",
                quantity: 0,
            }),
        );
    });
});
