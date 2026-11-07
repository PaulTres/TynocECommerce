// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("EmptyState", () => {
    it("renders its title, message and action link", () => {
        render(
            <EmptyState
                title="No saved items"
                message="Save something for later."
                actionHref="/products"
                actionLabel="Shop"
            />,
        );
        expect(
            screen.getByRole("heading", { name: "No saved items" }),
        ).toBeTruthy();
        expect(screen.getByText("Save something for later.")).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Shop" }).getAttribute("href"),
        ).toBe("/products");
    });

    it("omits the action unless both URL and label are supplied", () => {
        const { rerender } = render(
            <EmptyState
                title="Empty"
                message="Nothing yet"
                actionHref="/products"
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        rerender(
            <EmptyState
                title="Empty"
                message="Nothing yet"
                actionLabel="Shop"
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
    });
});
