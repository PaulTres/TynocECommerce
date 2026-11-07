// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
    it("renders the store identity and demo disclaimer", () => {
        render(<Footer />);
        expect(screen.getByText(/demo store/i).textContent).toContain(
            "No real orders are placed",
        );
        expect(screen.getByText(/demo store/i).textContent).toContain(
            "Parcel is a demo store",
        );
    });
});
