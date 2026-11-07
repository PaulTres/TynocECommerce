// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("route ErrorPage", () => {
    it("shows a safe message and resets the segment on retry", async () => {
        const error = new Error("private internal detail");
        const reset = vi.fn();
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        render(<ErrorPage error={error} reset={reset} />);
        await waitFor(() => expect(log).toHaveBeenCalledWith(error));
        expect(screen.getByRole("alert").textContent).toContain(
            "We could not load this page",
        );
        expect(screen.queryByText("private internal detail")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(reset).toHaveBeenCalledOnce();
        log.mockRestore();
    });
});
