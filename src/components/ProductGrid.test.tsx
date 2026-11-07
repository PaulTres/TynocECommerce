// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any*/
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductGrid, ProductGridSkeleton } from "./ProductGrid";

vi.mock("@/components/ProductCard", () => ({
    ProductCard: ({ product, wishlisted, signedIn }: any) => (
        <article
            data-testid="card"
            data-wishlisted={String(wishlisted)}
            data-signed-in={String(signedIn)}
        >
            {product.name}
        </article>
    ),
}));
vi.mock("@/components/EmptyState", () => ({
    EmptyState: (props: any) => (
        <div data-testid="empty">
            {props.title}|{props.message}|{props.actionLabel}
        </div>
    ),
}));

const product = (id: string, name: string) => ({
    id,
    name,
    description: "",
    priceCents: 100,
    currency: "USD",
    categorySlug: "home",
    images: [],
    stock: 1,
    tags: [],
    featured: false,
    createdAt: "2026-01-01",
});

describe("ProductGrid", () => {
    it("renders the configured empty state", () => {
        render(
            <ProductGrid
                products={[]}
                wishlistIds={new Set()}
                signedIn={false}
                emptyTitle="No matches"
                emptyMessage="Try another search"
            />,
        );
        expect(screen.getByTestId("empty").textContent).toBe(
            "No matches|Try another search|Browse all products",
        );
        expect(screen.queryByTestId("card")).toBeNull();
    });

    it("renders one card per product with per-item wishlist state", () => {
        render(
            <ProductGrid
                products={[product("a", "A"), product("b", "B")]}
                wishlistIds={new Set(["b"])}
                signedIn
            />,
        );
        const cards = screen.getAllByTestId("card");
        expect(cards).toHaveLength(2);
        expect(cards[0].getAttribute("data-wishlisted")).toBe("false");
        expect(cards[1].getAttribute("data-wishlisted")).toBe("true");
        expect(cards[0].getAttribute("data-signed-in")).toBe("true");
    });
});

describe("ProductGridSkeleton", () => {
    it("renders the requested number of loading placeholders", () => {
        render(<ProductGridSkeleton count={3} />);
        expect(
            document
                .querySelector("[aria-label='Loading products']")
                ?.getAttribute("aria-busy"),
        ).toBe("true");
        expect(
            document.querySelectorAll("[aria-busy=true] > div"),
        ).toHaveLength(3);
    });

    it("defaults to eight placeholders", () => {
        render(<ProductGridSkeleton />);
        expect(
            document.querySelectorAll("[aria-busy=true] > div"),
        ).toHaveLength(8);
    });
});
