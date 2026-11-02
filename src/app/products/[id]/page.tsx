import { AddToCartForm } from "@/components/AddToCartForm";
import { ProductGrid } from "@/components/ProductGrid";
import { WishlistButton } from "@/components/WishlistButton";
import { getUserId } from "@/lib/api/session";
import { MAX_QTY_PER_ITEM, STOCK_WARNING_THRESHOLD } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { formatPrice } from "@/lib/utils";
import { productIdSchema } from "@/lib/validation/schemas";
import { getProductDetail } from "@/services/product.service";
import { getWishlistIds } from "@/services/wishlist.service";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

type Params = { params: Promise<{ id: string }> };

/**
 * Loads the product or triggers the 404 page.
 * Invalid ids (fail the zod pattern) and unknown ids both end in notFound(); any other
 * error is rethrown so error.tsx handles it.
 */
async function load(id: string) {
    const parsed = productIdSchema.safeParse(id);
    if (!parsed.success) notFound();
    try {
        return await getProductDetail(parsed.data);
    } catch (err) {
        if (err instanceof NotFoundError) notFound();
        throw err;
    }
}

/** Per-product title and description. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { product } = await load((await params).id);
    return {
        title: product.name,
        description: product.description.slice(0, 160),
    };
}

/** Product detail page: gallery, price, stock, add-to-cart, wishlist and related products. */
export default async function ProductPage({ params }: Params) {
    const { product, category, related } = await load((await params).id);
    const userId = await getUserId();
    const wishlistIds = userId
        ? await getWishlistIds(userId)
        : new Set<string>();

    return (
        <div className="space-y-12">
            <nav aria-label="Breadcrumb" className="text-sm text-slate">
                <Link href="/products" className="hover:text-ink">
                    Shop
                </Link>
                {category && (
                    <>
                        {" "}
                        /{" "}
                        <Link
                            href={`/products?category=${category.slug}`}
                            className="hover:text-ink"
                        >
                            {category.name}
                        </Link>
                    </>
                )}
            </nav>
            <div className="grid gap-8 md:grid-cols-2">
                <div className="grid grid-cols-2 gap-3">
                    {(product.images.length
                        ? product.images
                        : ["/placeholder.svg"]
                    ).map((src, i) => (
                        <Image
                            key={`${i}-${src}`}
                            src={src}
                            alt={i === 0 ? product.name : ""}
                            width={800}
                            height={800}
                            priority={i === 0}
                            className={`rounded-lg object-cover ${i === 0 ? "col-span-2" : ""}`}
                        />
                    ))}
                </div>
                <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <h1 className="text-3xl font-bold">{product.name}</h1>
                        <WishlistButton
                            productId={product.id}
                            initialWishlisted={wishlistIds.has(product.id)}
                            signedIn={Boolean(userId)}
                        />
                    </div>
                    <p className="text-2xl font-semibold">
                        {formatPrice(product.priceCents)}
                    </p>
                    <p className="text-slate">{product.description}</p>
                    <p className="text-sm font-medium text-signal">
                        {product.stock === 0
                            ? "Out of stock"
                            : product.stock <= STOCK_WARNING_THRESHOLD
                              ? `Only ${product.stock} left`
                              : ""}
                    </p>
                    <AddToCartForm
                        productId={product.id}
                        maxQuantity={Math.min(MAX_QTY_PER_ITEM, product.stock)}
                        signedIn={Boolean(userId)}
                    />
                </div>
            </div>
            {related.length > 0 && (
                <section aria-labelledby="related">
                    <h2 id="related" className="mb-4 text-xl font-semibold">
                        Related products
                    </h2>
                    <ProductGrid
                        products={related}
                        wishlistIds={wishlistIds}
                        signedIn={Boolean(userId)}
                    />
                </section>
            )}
        </div>
    );
}
