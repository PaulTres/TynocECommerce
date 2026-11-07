import { loginAction } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import LoginPage, { metadata } from "./page";

vi.mock("@/actions/auth", () => ({
    loginAction: vi.fn(),
    registerAction: vi.fn(),
}));
vi.mock("@/components/AuthForm", () => ({ AuthForm: vi.fn() }));

describe("LoginPage", () => {
    it("renders login mode with its sanitized callback destination", async () => {
        const result = await LoginPage({
            searchParams: Promise.resolve({ callbackUrl: "/cart" }),
        });
        const element = result as ReactElement<{
            mode: string;
            action: unknown;
            callbackUrl: string;
        }>;
        expect(element.type).toBe(AuthForm);
        expect(element.props).toEqual({
            mode: "login",
            action: loginAction,
            callbackUrl: "/cart",
        });
    });

    it.each([
        ["https://bad.example", "/"],
        [undefined, "/"],
    ])("sanitizes callback %s", async (callbackUrl, expected) => {
        const element = (await LoginPage({
            searchParams: Promise.resolve({ callbackUrl }),
        })) as ReactElement<{ callbackUrl: string }>;
        expect(element.props.callbackUrl).toBe(expected);
    });

    it("exports the sign-in title", () => {
        expect(metadata).toEqual({ title: "Sign in" });
    });
});
