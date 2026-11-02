"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCartAction } from "@/actions/cart";

interface Props { productId: string; maxQuantity: number; signedIn: boolean }

/**
 * Quantity picker + "Add to cart" button for the product page.
 * Shows pending, success and error states; out-of-stock products render a disabled button.
 */
export function AddToCartForm({ productId, maxQuantity, signedIn }: Props) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  /** Calls the Server Action; the server re-validates everything, this is just UX. */
  function submit() {
    if (!signedIn) return router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    setMessage(null);
    startTransition(async () => {
      const result = await addToCartAction({ productId, quantity });
      setMessage(result.ok ? { kind: "ok", text: "Added to your cart" } : { kind: "error", text: result.error.message });
    });
  }

  if (maxQuantity <= 0) return <button className="btn-primary w-full" disabled>Out of stock</button>;

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <label className="sr-only" htmlFor="qty">Quantity</label>
        <select id="qty" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="field w-24">
          {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={submit} disabled={pending} className="btn-primary flex-1">{pending ? "Adding..." : "Add to cart"}</button>
      </div>
      {message && <p role="status" className={message.kind === "ok" ? "text-sm text-accent" : "text-sm text-danger"}>{message.text}</p>}
    </div>
  );
}
