import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ProductGrid, ProductGridSkeleton } from "@/components/ProductGrid";
import { getUserId } from "@/lib/api/session";
import { getWishlistIds } from "@/services/wishlist.service";
import { getCategories, getFeaturedProducts, getNewArrivals } from "@/services/product.service";

/** Async shelf component: fetches its own data so <Suspense> can stream it independently. */
async function Shelf({ kind }: { kind: "featured" | "new" }) {
  const userId = await getUserId();
  const [products, wishlistIds] = await Promise.all([
    kind === "featured" ? getFeaturedProducts(4) : getNewArrivals(4),
    userId ? getWishlistIds(userId) : Promise.resolve(new Set<string>()),
  ]);
  return <ProductGrid products={products} wishlistIds={wishlistIds} signedIn={Boolean(userId)} emptyTitle="No products yet" emptyMessage="Run `npm run db:seed` to load the sample catalogue." />;
}

/** Category tiles. Failure here returns an empty row. */
async function Categories() {
  const categories = await getCategories().catch(() => []);
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {categories.map((c) => (
        <Link key={c.slug} href={`/products?category=${c.slug}`} className="group relative block aspect-[4/3] overflow-hidden rounded-lg bg-ink">
          <Image src={c.imageUrl} alt="" fill sizes="(min-width:768px) 25vw, 50vw" className="object-cover opacity-70 group-hover:opacity-90" />
          <span className="absolute bottom-3 left-3 text-lg font-semibold text-white">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}

/** Homepage: hero, categories, featured and new-arrival shelves (each streamed with a skeleton). */
export default function HomePage() {
  return (
    <div className="space-y-14">
      <section className="py-6 sm:py-12">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Everyday goods, chosen with care.</h1>
        <p className="mt-4 max-w-xl text-lg text-slate">Home, kitchen and desk essentials that last. Save favourites, fill your cart, and come back to it from any device.</p>
        <Link href="/products" className="btn-primary mt-6">Shop all products</Link>
      </section>
      <section aria-labelledby="cats"><h2 id="cats" className="mb-4 text-xl font-semibold">Shop by category</h2>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-line/60" />}><Categories /></Suspense></section>
      <section aria-labelledby="feat"><h2 id="feat" className="mb-4 text-xl font-semibold">Featured</h2>
        <Suspense fallback={<ProductGridSkeleton count={4} />}><Shelf kind="featured" /></Suspense></section>
      <section aria-labelledby="new"><h2 id="new" className="mb-4 text-xl font-semibold">New arrivals</h2>
        <Suspense fallback={<ProductGridSkeleton count={4} />}><Shelf kind="new" /></Suspense></section>
    </div>
  );
}
