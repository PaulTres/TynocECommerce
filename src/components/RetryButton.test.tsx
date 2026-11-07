// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetryButton } from "./RetryButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("RetryButton", () => {
    it("refreshes the current route", () => {
        render(<RetryButton />);
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(refresh).toHaveBeenCalledOnce();
    });
});
