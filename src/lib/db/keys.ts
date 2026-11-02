/**
 * Single-table key builders. Every key format lives in this file so repositories never
 * hand-write "USER#..." strings. The table pattern can also be found in the README.
 *
 *  Entity      PK                 SK                 GSI1 (PK / SK)                 GSI2 (PK / SK)
 *  User        USER#<id>          PROFILE            -                              -
 *  EmailLock   EMAIL#<email>      LOCK               -                              -
 *  Category    CATEGORY#<slug>    META               -                              CATEGORIES / <name>
 *  Product     PRODUCT#<id>       META               CATPRODUCTS#<slug> / <ts>#<id> PRODUCTS / <ts>#<id>
 *  Cart item   USER#<id>          CART#<productId>   -                              -
 *  Wishlist    USER#<id>          WISH#<productId>   -                              -
 */
export const keys = {
  user: (id: string) => ({ PK: `USER#${id}`, SK: "PROFILE" }),
  emailLock: (email: string) => ({ PK: `EMAIL#${email}`, SK: "LOCK" }),
  category: (slug: string) => ({ PK: `CATEGORY#${slug}`, SK: "META" }),
  product: (id: string) => ({ PK: `PRODUCT#${id}`, SK: "META" }),
  cartItem: (userId: string, productId: string) => ({ PK: `USER#${userId}`, SK: `CART#${productId}` }),
  wishItem: (userId: string, productId: string) => ({ PK: `USER#${userId}`, SK: `WISH#${productId}` }),
};

export const CART_PREFIX = "CART#";
export const WISH_PREFIX = "WISH#";
export const categoryProductsPk = (slug: string) => `CATPRODUCTS#${slug}`;
export const ALL_PRODUCTS_PK = "PRODUCTS";
export const ALL_CATEGORIES_PK = "CATEGORIES";

const INTERNAL_ATTRS = new Set([
  "PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK", "entityType", "searchText",
]);

/**
 * Removes storage-only attributes from a DynamoDB item.
 * Callers (services/UI) must never see or depend on key design.
 */
export function stripKeys<T>(item: Record<string, unknown>): T {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) if (!INTERNAL_ATTRS.has(k)) clean[k] = v;
  return clean as T;
}
