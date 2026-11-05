/**
 * Domain types shared by every layer (UI, services, repositories).
 */

/** Public user data. The password hash is deliberately not part of this type. */
export interface User {
    id: string;
    email: string;
    name: string;
    createdAt: string; // ISO-8601
}

export interface Category {
    slug: string; // doubles as the unique id and URL segment
    name: string;
    description: string;
    imageUrl: string;
}

/** Money is always stored as integer minor units (cents) to avoid float errors. */
export interface Product {
    id: string; // URL-safe slug, e.g. "linen-throw-blanket"
    name: string;
    description: string;
    priceCents: number;
    currency: string;
    categorySlug: string;
    images: string[];
    stock: number;
    tags: string[];
    featured: boolean;
    createdAt: string;
}

/** What is persisted for a cart row: just a reference + quantity, no price snapshot. */
export interface CartItemRecord {
    productId: string;
    quantity: number;
    addedAt: string;
    updatedAt: string;
}

/** A cart row joined with live product data, ready for rendering. */
export interface CartLine {
    product: Product;
    quantity: number;
    lineTotalCents: number;
    /** True when the requested quantity exceeds current stock. Used to show warnings. */
    exceedsStock: boolean;
}

/** Cart containing cart lines, sum of quantities, subtotalCents and the type of currency(currently unused). */
export interface Cart {
    lines: CartLine[];
    itemCount: number; // sum of quantities
    subtotalCents: number;
    currency: string;
}

/** Record for keeping track of wishlist items. */
export interface WishlistItemRecord {
    productId: string;
    addedAt: string;
}

export type ProductSort = "newest" | "price-asc" | "price-desc";

/** Interface used to build queries for products. */
export interface ProductQuery {
    search?: string;
    categorySlug?: string;
    minPriceCents?: number;
    maxPriceCents?: number;
    sort?: ProductSort;
    limit?: number;
    nextCursor?: string;
    prevCursor?: string;
    featured?: boolean;
}

/** Cursor page. `cursor === undefined` means there is nothing more to load. */
export interface Page<T> {
    items: T[];
    prevCursor: string | undefined;
    nextCursor: string | undefined;
}

/** Uniform return type for server actions. */
export type ActionResult<T = void> =
    | { ok: true; data: T }
    | {
          ok: false;
          error: {
              code: string;
              message: string;
              fieldErrors?: Record<string, string[] | undefined>;
          };
      };

export type ProductRow = {
    id: unknown;
    name: unknown;
    description: unknown;
    priceCents: unknown;
    currency: unknown;
    categorySlug: unknown;
    images: unknown;
    stock: unknown;
    tags: unknown;
    featured: unknown;
    createdAt: unknown;
};

export type ProductCursorRow = {
    id: string;
    priceCents: number;
    createdAt: string;
};
