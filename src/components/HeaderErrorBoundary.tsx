"use client";

import { SITE_NAME } from "@/lib/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Component,
  startTransition,
  type ErrorInfo,
  type ReactNode,
} from "react";

interface BoundaryProps {
    children: ReactNode;
    refresh: () => void;
}

interface BoundaryState {
    hasError: boolean;
}

/** Shown when the real header fails (e.g. Neon Auth or the Data API is down).*/
function HeaderFallback({ onRetry }: { onRetry: () => void }) {
    return (
        <header className="border-b border-line bg-surface" role="banner">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
                <Link href="/" className="text-xl font-bold tracking-tight">
                    {SITE_NAME}
                </Link>
            </div>
            {/* role="status" announces the degraded state to screen readers without stealing focus. */}
            <p
                role="status"
                className="bg-paper px-4 py-1 text-center text-xs text-slate"
            >
                Account features are temporarily unavailable.{" "}
                <button
                    type="button"
                    onClick={onRetry}
                    className="underline hover:text-accent"
                >
                    Retry
                </button>
            </p>
        </header>
    );
}

/**
 * Class-based boundary.
 */
class Boundary extends Component<BoundaryProps, BoundaryState> {
    state: BoundaryState = { hasError: false };

    static getDerivedStateFromError(): BoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // In production the message is redacted by Next.
        console.error("[header] render failed", error, info.componentStack);
    }

    retry = (): void => {
        startTransition(() => {
            this.props.refresh();
            this.setState({ hasError: false });
        });
    };

    render(): ReactNode {
        return this.state.hasError ? (
            <HeaderFallback onRetry={this.retry} />
        ) : (
            this.props.children
        );
    }
}

export function HeaderErrorBoundary({ children }: { children: ReactNode }) {
    const router = useRouter();
    return <Boundary refresh={() => router.refresh()}>{children}</Boundary>;
}
