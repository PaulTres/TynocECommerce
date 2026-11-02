import { MAX_QTY_PER_ITEM } from "@/lib/constants";
import * as cartRepo from "@/lib/db/cart.repo";
import * as productsRepo from "@/lib/db/products.repo";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Cart, CartLine } from "@/types";

/**
 * Builds the user's cart with live product data and totals.
 * Reads cart rows, gets the products, joins them in memory, then
 * sums integer cents. Prices come from the product table at read time, so a price change
 * is reflected immediately and the client can never tamper with prices.
 * Rows whose product was deleted are skipped(implement cleanup in the future).
 */
export async function getCart(userId: string): Promise<Cart> {
    const rows = await cartRepo.listCartItems(userId);
    const products = await productsRepo.batchGetProducts(
        rows.map((r) => r.productId),
    );
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines: CartLine[] = [];
    for (const row of rows) {
        const product = byId.get(row.productId);
        if (!product) continue; //skip deleted products
        lines.push({
            product,
            quantity: row.quantity,
            lineTotalCents: product.priceCents * row.quantity,
            exceedsStock: row.quantity > product.stock,
        });
    }
    return {
        lines,
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
        currency: "USD",
    };
}

/** Number of items in the cart, for the header badge. */
export async function getCartCount(userId: string): Promise<number> {
    return (await getCart(userId)).itemCount;
}

/**
 * Adds a product to the cart (or increases its quantity).
 * Business rules: product must exist, be in stock, and the line may not exceed min(MAX_QTY_PER_ITEM, stock). The cap is re-checked atomically inside the repository.
 * Stock is validated, not reserved. Reservation left for future checkout step.
 */
export async function addToCart(
    userId: string,
    productId: string,
    quantity: number,
): Promise<number> {
    const product = await productsRepo.getProduct(productId);
    if (!product) throw new NotFoundError("Product not found");
    if (product.stock <= 0)
        throw new ConflictError("This product is out of stock");
    return cartRepo.incrementItem(
        userId,
        productId,
        quantity,
        Math.min(MAX_QTY_PER_ITEM, product.stock),
    );
}

/** Sets an exact quantity; 0 removes the line. Quantity is capped by stock like in addToCart. */
export async function updateQuantity(
    userId: string,
    productId: string,
    quantity: number,
): Promise<void> {
    if (quantity === 0) return cartRepo.removeItem(userId, productId);
    const product = await productsRepo.getProduct(productId);
    if (!product) throw new NotFoundError("Product not found");
    const cap = Math.min(MAX_QTY_PER_ITEM, product.stock);
    if (quantity > cap)
        throw new ConflictError(`Only ${cap} available for this item`);
    await cartRepo.setQuantity(userId, productId, quantity);
}

/** Removes a line from the cart. */
export async function removeFromCart(
    userId: string,
    productId: string,
): Promise<void> {
    await cartRepo.removeItem(userId, productId);
}
