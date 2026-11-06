import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { registerAction } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";

import RegisterPage, { metadata } from "./page";

vi.mock("@/actions/auth", () => ({
    registerAction: vi.fn(),
}));

vi.mock("@/components/AuthForm", () => ({
    AuthForm: vi.fn(),
}));

type AuthFormProps = {
    mode: string;
    action: unknown;
    callbackUrl: string;
};

/**
 * Invokes the async server component the way Next.js does: it passes
 * `searchParams` as a Promise and awaits the result.
 * Returns the resulting React element so tests can inspect type and props
 * without needing a renderer.
 *
 * @param callbackUrl value of the `?callbackUrl=` query param (undefined = absent)
 */
async function renderPage(
    callbackUrl?: string,
): Promise<ReactElement<AuthFormProps>> {
    const element = await RegisterPage({
        searchParams: Promise.resolve({ callbackUrl }),
    });
    return element as ReactElement<AuthFormProps>;
}

describe("RegisterPage metadata", () => {
    it("sets the page title to 'Create account'", () => {
        expect(metadata).toEqual({ title: "Create account" });
    });
});

describe("RegisterPage", () => {
    // Verifies the core wiring: right component, right mode, right server action.
    it("renders AuthForm in register mode wired to registerAction", async () => {
        const element = await renderPage();

        expect(element.type).toBe(AuthForm);
        expect(element.props.mode).toBe("register");
        expect(element.props.action).toBe(registerAction);
    });

    it("passes exactly mode, action and callbackUrl to AuthForm", async () => {
        const element = await renderPage("/dashboard");

        expect(element.props).toEqual({
            mode: "register",
            action: registerAction,
            callbackUrl: "/dashboard",
        });
    });

    it("awaits the searchParams promise before reading callbackUrl", async () => {
        const element = await RegisterPage({
            searchParams: new Promise((resolve) =>
                setTimeout(() => resolve({ callbackUrl: "/late" }), 5),
            ),
        });

        expect((element as ReactElement<AuthFormProps>).props.callbackUrl).toBe(
            "/late",
        );
    });

    describe("callbackUrl sanitisation", () => {
        // Legitimate same-origin relative paths must survive untouched,
        // including query strings and hash fragments.
        it.each([
            ["/dashboard"],
            ["/settings/profile"],
            ["/orders?id=42&tab=items"],
            ["/docs#section-2"],
            ["/"],
        ])("keeps safe relative path %j", async (input) => {
            const element = await renderPage(input);
            expect(element.props.callbackUrl).toBe(input);
        });

        // Missing / empty values fall back to the default "/" rather than
        // passing undefined down to the client form.
        it.each([[undefined], [""]])(
            "falls back to '/' when callbackUrl is %j",
            async (input) => {
                const element = await renderPage(input);
                expect(element.props.callbackUrl).toBe("/");
            },
        );

        // Open-redirect attack vectors: absolute URLs, protocol-relative URLs,
        // backslash tricks (browsers treat "\" like "/"), bare hosts and
        // dangerous schemes. All must be neutralised to the fallback so a
        // crafted /register?callbackUrl=... link cannot send a freshly
        // registered user to an attacker-controlled site.
        it.each([
            ["https://evil.com"],
            ["http://evil.com/login"],
            ["//evil.com"],
            ["///evil.com"],
            ["/\\evil.com"],
            ["\\\\evil.com"],
            ["evil.com"],
            ["javascript:alert(1)"],
            ["data:text/html,<script>alert(1)</script>"],
        ])("rejects unsafe callbackUrl %j", async (input) => {
            const element = await renderPage(input);
            expect(element.props.callbackUrl).toBe("/");
        });

        it("rejects tab/newline smuggled protocol-relative URLs", async () => {
            const element = await renderPage("/\t/evil.com");
            expect(element.props.callbackUrl).toBe("/");
        });
    });
});
