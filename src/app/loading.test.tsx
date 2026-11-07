// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("route Loading", () => {
    it("renders the labeled loading region", () => {
        render(<Loading />);
        expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    });
});
