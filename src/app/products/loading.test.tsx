// @vitest-environment jsdom - used for rendering during tests
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Loading from "./loading";

vi.mock("@/components/ProductGrid", () => ({
    ProductGridSkeleton: ({ count }: { count: number }) => (
        <div role="status" aria-label="Loading products" data-count={count} />
    ),
}));

describe("product listing Loading", () => {
    it("requests twelve product placeholders", () => {
        render(<Loading />);
        expect(
            screen
                .getByRole("status", { name: "Loading products" })
                .getAttribute("data-count"),
        ).toBe("12");
    });
});
