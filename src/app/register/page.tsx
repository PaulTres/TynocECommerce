import { registerAction } from "@/actions/auth";
import { AuthForm } from "@/components/AuthForm";
import { safeRedirectPath } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create account" };

/** Registration page; same sanitised callback handling as login. */
export default async function RegisterPage({
    searchParams,
}: {
    searchParams: Promise<{ callbackUrl?: string }>;
}) {
    const { callbackUrl } = await searchParams;
    return (
        <AuthForm
            mode="register"
            action={registerAction}
            callbackUrl={safeRedirectPath(callbackUrl)}
        />
    );
}
