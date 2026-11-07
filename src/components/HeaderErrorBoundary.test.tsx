// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any*/
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderErrorBoundary } from "./HeaderErrorBoundary";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

function BrokenHeader(): never {
    throw new Error("header unavailable");
}

describe("HeaderErrorBoundary", () => {
    it("shows its fallback and refreshes the route after retry", () => {
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        render(
            <HeaderErrorBoundary>
                <BrokenHeader />
            </HeaderErrorBoundary>,
        );
        expect(screen.getByRole("status").textContent).toContain(
            "Account features are temporarily unavailable",
        );
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(refresh).toHaveBeenCalledOnce();
        log.mockRestore();
    });
});
