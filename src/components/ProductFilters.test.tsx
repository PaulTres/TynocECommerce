// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductFilters } from "./ProductFilters";

describe("ProductFilters", () => {
    it("shows selected filter values and category choices", () => {
        render(
            <ProductFilters
                categories={[
                    {
                        slug: "home",
                        name: "Home",
                        description: "Home goods",
                        imageUrl: "/home.jpg",
                    },
                ]}
                values={{
                    q: "linen",
                    category: "home",
                    min: 10,
                    max: 80,
                    sort: "price-desc",
                }}
            />,
        );
        expect(screen.getByRole("search").getAttribute("action")).toBe(
            "/products",
        );
        expect(
            (screen.getByLabelText("Search") as HTMLInputElement).value,
        ).toBe("linen");
        expect(
            (screen.getByLabelText("Category") as HTMLSelectElement).value,
        ).toBe("home");
        expect((screen.getByLabelText("Min $") as HTMLInputElement).value).toBe(
            "10",
        );
        expect((screen.getByLabelText("Max $") as HTMLInputElement).value).toBe(
            "80",
        );
        expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe(
            "price-desc",
        );
        expect(screen.getByRole("option", { name: "Home" })).toBeTruthy();
    });

    it("uses default selections and renders every validation error", () => {
        render(
            <ProductFilters
                categories={[]}
                values={{}}
                validationErrors={["Minimum is invalid", "Maximum is invalid"]}
            />,
        );
        expect(
            (screen.getByLabelText("Category") as HTMLSelectElement).value,
        ).toBe("");
        expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe(
            "newest",
        );
        expect(screen.getByRole("alert").textContent).toContain(
            "Minimum is invalid",
        );
        expect(screen.getByRole("alert").textContent).toContain(
            "Maximum is invalid",
        );
        expect(
            screen.getByRole("link", { name: "Clear" }).getAttribute("href"),
        ).toBe("/products");
    });
});
