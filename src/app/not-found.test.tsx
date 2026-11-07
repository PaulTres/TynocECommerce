// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any*/
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NotFound from "./not-found";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("NotFound", () => {
    it("renders the recovery link", () => {
        render(<NotFound />);
        expect(
            screen.getByRole("heading", {
                name: "We could not find that page",
            }),
        ).toBeTruthy();
        expect(screen.getByText(/product may have been removed/i)).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Back to the shop" })
                .getAttribute("href"),
        ).toBe("/products");
    });
});
