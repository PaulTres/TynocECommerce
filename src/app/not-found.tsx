import Link from "next/link";

/** Rendered for unknown URLs and whenever a page calls notFound() (e.g. unknown product id). */
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-3xl font-bold">We could not find that page</h1>
      <p className="mt-2 text-slate">The link may be broken, or the product may have been removed.</p>
      <Link href="/products" className="btn-primary mt-6">Back to the shop</Link>
    </div>
  );
}
