// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any*/
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "./ProductCard";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: (props: any) => <span role="img" aria-label={props.alt} data-src={props.src} /> }));
vi.mock("@/components/WishlistButton", () => ({ WishlistButton: (props: any) => <button aria-label="wishlist" data-id={props.productId} data-liked={String(props.initialWishlisted)} /> }));

const makeProduct = (overrides: Record<string, unknown> = {}) => ({ id: "linen-throw", name: "Linen throw", description: "Soft", priceCents: 2599, currency: "USD", categorySlug: "home", images: ["/throw.jpg"], stock: 4, tags: [], featured: false, createdAt: "2026-01-01", ...overrides });

describe("ProductCard", () => {
    it("renders the product and wishlist state for signed-in customers", () => {
        render(<ProductCard product={makeProduct() as any} wishlisted signedIn />);
        expect(screen.getAllByRole("link", { name: "Linen throw" })).toHaveLength(2);
        expect(screen.getAllByRole("link", { name: "Linen throw" })[0].getAttribute("href")).toBe("/products/linen-throw");
        expect(screen.getByText("$25.99")).toBeTruthy();
        expect(screen.getByRole("button", { name: "wishlist" }).getAttribute("data-liked")).toBe("true");
        expect(screen.getByRole("img").getAttribute("data-src")).toBe("/throw.jpg");
    });

    it("uses a placeholder image and reports zero, low and healthy stock correctly", () => {
        const { rerender } = render(<ProductCard product={makeProduct({ images: [], stock: 0 }) as any} wishlisted={false} signedIn={false} />);
        expect(screen.getByRole("img").getAttribute("data-src")).toBe("/placeholder.svg");
        expect(screen.getByText("Out of stock")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "wishlist" })).toBeNull();
        rerender(<ProductCard product={makeProduct({ stock: 2 }) as any} wishlisted={false} signedIn={false} />);
        expect(screen.getByText("Only 2 left")).toBeTruthy();
        rerender(<ProductCard product={makeProduct({ stock: 8 }) as any} wishlisted={false} signedIn={false} />);
        expect(screen.queryByText(/left|Out of stock/)).toBeNull();
    });
});
