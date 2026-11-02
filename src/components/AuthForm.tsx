"use client";

import type { FormState } from "@/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

interface Props {
    mode: "login" | "register";
    action: (prev: FormState, formData: FormData) => Promise<FormState>;
    callbackUrl: string;
}

/**
 * Shared login/register form. `useActionState` wires the Server Action's returned errors
 * (field-level and form-level) straight into the markup, with pending state for the button.
 * The server validates again.
 */
export function AuthForm({ mode, action, callbackUrl }: Props) {
    const [state, formAction, pending] = useActionState(
        action,
        {} as FormState,
    );
    const isRegister = mode === "register";
    const err = (name: string) => state.fieldErrors?.[name]?.[0];

    return (
        <form
            action={formAction}
            className="mx-auto max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6"
            noValidate
        >
            <h1 className="text-2xl font-bold">
                {isRegister ? "Create your account" : "Sign in"}
            </h1>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            {isRegister && (
                <label className="block text-sm">
                    <span className="mb-1 block font-medium">Name</span>
                    <input
                        name="name"
                        autoComplete="name"
                        required
                        className="field"
                        aria-invalid={Boolean(err("name"))}
                    />
                    {err("name") && (
                        <span className="mt-1 block text-danger">
                            {err("name")}
                        </span>
                    )}
                </label>
            )}
            <label className="block text-sm">
                <span className="mb-1 block font-medium">Email</span>
                <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="field"
                    aria-invalid={Boolean(err("email"))}
                />
                {err("email") && (
                    <span className="mt-1 block text-danger">
                        {err("email")}
                    </span>
                )}
            </label>
            <label className="block text-sm">
                <span className="mb-1 block font-medium">Password</span>
                <input
                    name="password"
                    type="password"
                    autoComplete={
                        isRegister ? "new-password" : "current-password"
                    }
                    required
                    className="field"
                    aria-invalid={Boolean(err("password"))}
                />
                {err("password") && (
                    <span className="mt-1 block text-danger">
                        {err("password")}
                    </span>
                )}
            </label>
            {state.error && (
                <p role="alert" className="text-sm text-danger">
                    {state.error}
                </p>
            )}
            <button className="btn-primary w-full" disabled={pending}>
                {pending
                    ? "Please wait..."
                    : isRegister
                      ? "Create account"
                      : "Sign in"}
            </button>
            <p className="text-center text-sm text-slate">
                {isRegister ? "Already have an account? " : "New here? "}
                <Link
                    className="text-accent underline"
                    href={isRegister ? "/login" : "/register"}
                >
                    {isRegister ? "Sign in" : "Create an account"}
                </Link>
            </p>
        </form>
    );
}
