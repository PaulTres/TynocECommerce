import { WishlistButton } from "@/components/WishlistButton";
import { STOCK_WARNING_THRESHOLD } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";
import Image from "next/image";
import Link from "next/link";

interface Props {
    product: Product;
    wishlisted: boolean;
    signedIn: boolean;
}

/** Product tile used in every grid. The whole image/title is one link; the heart is a separate control. */
export function ProductCard({ product, wishlisted, signedIn }: Props) {
    //console.log(product.id, product.name);
    return (
        <article className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
            <Link
                href={`/products/${product.id}`}
                className="block aspect-square overflow-hidden bg-paper"
            >
                <Image
                    src={product.images[0] ?? "/placeholder.svg"}
                    alt={product.name}
                    width={600}
                    height={600}
                    sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
                    className="h-full w-full object-cover"
                />
            </Link>
            {signedIn && (
                <div className="absolute right-2 top-2">
                    <WishlistButton
                        productId={product.id}
                        initialWishlisted={wishlisted}
                    />
                </div>
            )}
            <div className="flex flex-1 flex-col gap-1 p-3">
                <Link
                    href={`/products/${product.id}`}
                    className="text-sm font-semibold hover:text-accent"
                >
                    {product.name}
                </Link>
                <p className="text-sm text-slate">
                    {formatPrice(product.priceCents)}
                </p>
                {product.stock === 0 && (
                    <p className="text-xs font-medium text-signal">
                        Out of stock
                    </p>
                )}
                {product.stock > 0 &&
                    product.stock <= STOCK_WARNING_THRESHOLD && (
                        <p className="text-xs font-medium text-signal">
                            Only {product.stock} left
                        </p>
                    )}
            </div>
        </article>
    );
}
