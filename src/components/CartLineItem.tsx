"use client";

import { removeFromCartAction, updateCartQuantityAction } from "@/actions/cart";
import { MAX_QTY_PER_ITEM } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { CartLine } from "@/types";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";

/** One cart row: image, details, quantity stepper, line total and remove button. */
export function CartLineItem({ line }: { line: CartLine }) {
    const { product, quantity } = line;
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const max = Math.min(MAX_QTY_PER_ITEM, Math.max(product.stock, 1));

    /** Runs a cart mutation and surfaces any server-side error message under the row. */
    function run(action: () => ReturnType<typeof updateCartQuantityAction>) {
        setError(null);
        startTransition(async () => {
            const result = await action();
            if (!result.ok) setError(result.error.message);
        });
    }

    return (
        <li
            className="flex gap-4 border-b border-line py-4 last:border-0"
            aria-busy={pending}
        >
            <Image
                src={product.images[0] ?? "/placeholder.svg"}
                alt=""
                width={96}
                height={96}
                className="h-24 w-24 rounded-md object-cover"
            />
            <div className="flex flex-1 flex-col gap-2">
                <div className="flex justify-between gap-2">
                    <Link
                        href={`/products/${product.id}`}
                        className="font-semibold hover:text-accent"
                    >
                        {product.name}
                    </Link>
                    <span className="font-medium">
                        {formatPrice(line.lineTotalCents)}
                    </span>
                </div>
                <p className="text-sm text-slate">
                    {formatPrice(product.priceCents)} each
                </p>
                {line.exceedsStock && (
                    <p className="text-sm text-signal">
                        Only {product.stock} in stock - reduce the quantity to
                        continue.
                    </p>
                )}
                <div className="flex items-center gap-3">
                    {/*Quantity adjuster.*/}
                    <div className="flex items-center rounded-md border border-line">
                        <button
                            aria-label="Decrease quantity"
                            disabled={pending}
                            className="px-3 py-1.5"
                            onClick={() =>
                                run(() =>
                                    updateCartQuantityAction({
                                        productId: product.id,
                                        quantity: quantity - 1,
                                    }),
                                )
                            }
                        >
                            -
                        </button>
                        <span
                            className="min-w-8 text-center text-sm"
                            aria-live="polite"
                        >
                            {quantity}
                        </span>
                        <button
                            aria-label="Increase quantity"
                            disabled={pending || quantity >= max}
                            className="px-3 py-1.5"
                            onClick={() =>
                                run(() =>
                                    updateCartQuantityAction({
                                        productId: product.id,
                                        quantity: quantity + 1,
                                    }),
                                )
                            }
                        >
                            +
                        </button>
                    </div>
                    <button
                        disabled={pending}
                        className="text-sm text-slate underline hover:text-danger"
                        onClick={() =>
                            run(() => removeFromCartAction(product.id))
                        }
                    >
                        Remove
                    </button>
                </div>
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
        </li>
    );
}
