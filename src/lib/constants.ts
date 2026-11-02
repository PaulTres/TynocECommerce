export const SITE_NAME = "Parcel";
export const MAX_QTY_PER_ITEM = 100; // anti-abuse cap on a single cart line
export const STOCK_WARNING_THRESHOLD = 5; //if the stock is below this value a warning will appear for this product
export const PAGE_SIZE = 12; // products per listing page
export const BCRYPT_ROUNDS = 12; // ~250ms on modern hardware: slows brute force, tolerable UX
export const PRODUCT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Max DynamoDB round-trips spent filling one page when a FilterExpression drops items. */
export const MAX_QUERY_ROUNDS = 5;
export const API_LIMIT = 100;