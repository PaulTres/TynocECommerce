"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Re-runs the server render of the current route (no full reload) so the Header's
 * session lookup is attempted again.
 */
export function RetryButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
            className="underline"
        >
            {pending ? "Retrying..." : "Retry"}
        </button>
    );
}
