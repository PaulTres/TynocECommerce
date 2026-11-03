"use client";

import {
  addToWishlistAction,
  removeFromWishlistAction,
} from "@/actions/wishlist";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";

interface Props {
    productId: string;
    initialWishlisted: boolean;
}

/**
 * Heart toggle with optimistic UI.
 * Flips local state immediately, calls the matching Server Action, and rolls back if the
 * action reports an error. Anonymous visitors are sent to /login instead of hitting the server.
 */
export function WishlistButton({ productId, initialWishlisted }: Props) {
    const [wishlisted, setWishlisted] = useState(initialWishlisted);
    const [pending, startTransition] = useTransition();

    /** Optimistically toggles, then reconciles with the server result. */
    function toggle() {
        const next = !wishlisted;
        setWishlisted(next);
        startTransition(async () => {
            const result = next
                ? await addToWishlistAction(productId)
                : await removeFromWishlistAction(productId);
            if (!result.ok) setWishlisted(!next); // rollback
        });
    }

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={wishlisted}
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border bg-surface text-lg",
                wishlisted
                    ? "border-accent text-accent"
                    : "border-line text-slate hover:text-ink",
            )}
        >
            {wishlisted ? "\u2665" : "\u2661"}
        </button>
    );
}
