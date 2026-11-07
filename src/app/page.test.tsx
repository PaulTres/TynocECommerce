import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";

vi.mock("@/lib/api/session", () => ({ getUserId: vi.fn() }));
vi.mock("@/services/wishlist.service", () => ({ getWishlistIds: vi.fn() }));
vi.mock("@/services/product.service", () => ({ getCategories: vi.fn(), getFeaturedProducts: vi.fn(), getNewArrivals: vi.fn() }));
vi.mock("@/components/ProductGrid", () => ({ ProductGrid: () => null, ProductGridSkeleton: () => null }));
vi.mock("next/link", () => ({ default: (props: unknown) => props }));
vi.mock("next/image", () => ({ default: (props: unknown) => props }));

describe("HomePage", () => {
    it("builds the expected shopping sections", () => {
        type NodeProps = { children?: ReactNode; href?: string; "aria-labelledby"?: string };
        const page = HomePage() as ReactElement<{ children: ReactElement<NodeProps>[] }>;
        const [hero, categories, featured, arrivals] = page.props.children;
        const heroChildren = hero.props.children as ReactElement<NodeProps>[];
        expect(heroChildren[0].props.children).toBe("Everyday goods, chosen with care.");
        expect(heroChildren[2].props.href).toBe("/products");
        expect(categories.props["aria-labelledby"]).toBe("cats");
        expect(featured.props["aria-labelledby"]).toBe("feat");
        expect(arrivals.props["aria-labelledby"]).toBe("new");
    });
});
