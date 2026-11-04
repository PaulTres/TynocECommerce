"use client";

import { useEffect } from "react";

/**
 * Error boundary for unexpected failures in any route segment.
 * Shows a friendly message with a retry; the real error is only logged, never rendered.
 */
export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);
    return (
        <div className="py-20 text-center" role="alert">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-slate">
                We could not load this page. Please try again in a moment.
            </p>
            <button onClick={reset} className="btn-primary mt-6">
                Try again
            </button>
        </div>
    );
}
