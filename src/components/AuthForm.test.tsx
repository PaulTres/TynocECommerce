// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any*/
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthForm } from "./AuthForm";

vi.mock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();
    return {
        ...actual,
        useActionState: (_action: unknown, state: unknown) => [
            state,
            vi.fn(),
            false,
        ],
    };
});
vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const action = async () => ({});

describe("AuthForm", () => {
    it("renders the login form and its callback URL", () => {
        render(<AuthForm mode="login" action={action} callbackUrl="/cart" />);
        expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
        expect(
            (document.querySelector('[name="callbackUrl"]') as HTMLInputElement)
                .value,
        ).toBe("/cart");
        expect(screen.getByLabelText("Email").getAttribute("type")).toBe(
            "email",
        );
        expect(
            screen.getByLabelText("Password").getAttribute("autocomplete"),
        ).toBe("current-password");
        expect(
            screen
                .getByRole("link", { name: "Create an account" })
                .getAttribute("href"),
        ).toBe("/register");
        expect(screen.queryByLabelText("Name")).toBeNull();
    });

    it("renders registration fields", () => {
        render(<AuthForm mode="register" action={action} callbackUrl="/" />);
        expect(
            screen.getByRole("heading", { name: "Create your account" }),
        ).toBeTruthy();
        expect(screen.getByLabelText("Name").getAttribute("autocomplete")).toBe(
            "name",
        );
        expect(screen.getByLabelText("Email").getAttribute("type")).toBe(
            "email",
        );
        expect(
            screen.getByLabelText("Password").getAttribute("autocomplete"),
        ).toBe("new-password");
        expect(
            screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
        ).toBe("/login");
    });
});
