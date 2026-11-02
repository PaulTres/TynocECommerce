import { CartLineItem } from "@/components/CartLineItem";
import { EmptyState } from "@/components/EmptyState";
import { requireUserId } from "@/lib/api/session";
import { formatPrice } from "@/lib/utils";
import { getCart } from "@/services/cart.service";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your cart" };

/** Cart page. Middleware already redirects anonymous users; requireUserId() is the real server-side check. */
export default async function CartPage() {
    const cart = await getCart(await requireUserId());
    if (cart.lines.length === 0) {
        return (
            <EmptyState
                title="Your cart is empty"
                message="Add a few things."
                actionHref="/products"
                actionLabel="Start shopping"
            />
        );
    }
    const blocked = cart.lines.some((l) => l.exceedsStock);
    return (
        <div className="grid gap-8 lg:grid-cols-3">
            <section className="lg:col-span-2">
                <h1 className="mb-2 text-3xl font-bold">Your cart</h1>
                <ul>
                    {cart.lines.map((line) => (
                        <CartLineItem key={line.product.id} line={line} />
                    ))}
                </ul>
            </section>
            <aside className="h-fit space-y-4 rounded-lg border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold">Order summary</h2>
                <dl className="flex justify-between text-sm">
                    <dt>Subtotal ({cart.itemCount} items)</dt>
                    <dd className="font-semibold">
                        {formatPrice(cart.subtotalCents)}
                    </dd>
                </dl>
                <p className="text-xs text-slate">
                    Shipping and taxes are calculated at checkout.
                </p>
                {/* Disabled checkout button. */}
                <button
                    className="btn-primary w-full"
                    disabled
                    title={
                        blocked
                            ? "Fix stock issues first"
                            : "Checkout is not part of this demo"
                    }
                >
                    Checkout (coming soon)
                </button>
            </aside>
        </div>
    );
}
