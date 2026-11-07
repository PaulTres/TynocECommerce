import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
    Geist: () => ({ variable: "font-test" }),
}));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/HeaderErrorBoundary", () => ({
    HeaderErrorBoundary: ({ children }: { children: unknown }) => children,
}));

describe("RootLayout", () => {
    it("exports site metadata", () => {
        expect(metadata.title).toEqual({
            default: "Parcel - everyday goods, well chosen",
            template: "%s | Parcel",
        });
        expect(metadata.description).toContain("e-commerce demo");
    });

    it("wraps children in the shared document shell", () => {
        const tree = RootLayout({ children: "page content" });
        const html = tree.props.children;
        expect(tree.type).toBe("html");
        expect(tree.props.lang).toBe("en");
        expect(html.type).toBe("body");
        expect(html.props.children[1].type).toBe("main");
        expect(html.props.children[1].props.children).toBe("page content");
    });
});
