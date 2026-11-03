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

/** Legacy fixture shape retained for the pre-Neon Auth tests; never persisted. */
export interface UserRecord extends User {
    passwordHash: string;
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
    currency: "USD";
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

export interface Cart {
    lines: CartLine[];
    itemCount: number; // sum of quantities
    subtotalCents: number;
    currency: "USD";
}

export interface WishlistItemRecord {
    productId: string;
    addedAt: string;
}

export type ProductSort = "newest" | "price-asc" | "price-desc";

export interface ProductQuery {
    search?: string;
    categorySlug?: string;
    minPriceCents?: number;
    maxPriceCents?: number;
    sort?: ProductSort;
    limit?: number;
    cursor?: string;
}

/** Cursor page. `nextCursor === null` means there is nothing more to load. */
export interface Page<T> {
    items: T[];
    nextCursor: string | null;
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
