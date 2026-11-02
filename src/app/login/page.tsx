import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { loginAction } from "@/actions/auth";
import { safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

/** Login page. The `callbackUrl` is sanitised so it can only point back into this site. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return <AuthForm mode="login" action={loginAction} callbackUrl={safeRedirectPath(callbackUrl)} />;
}
