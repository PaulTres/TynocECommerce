export const SITE_NAME = "Parcel";
export const MAX_QTY_PER_ITEM = 100; // anti-abuse cap on a single cart line
export const STOCK_WARNING_THRESHOLD = 5; //if the stock is below this value a warning will appear for this product
export const PAGE_SIZE = 12; // products per listing page
export const PRODUCT_ID_PATTERN = /^[a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*$/;
export const API_LIMIT = 100;
export const MAX_PRODUCT_ID_LENGTH = 100;
export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASS_LENGTH = 8;
export const MAX_PASS_LENGTH = 128;
export const MAX_CATEGORY_LENGTH = 60;
export const MAX_CURSOR_LENGTH = 2000;
export const MISSING_AUTH_CLAIMS_MESSAGE =
    "An authenticated Neon Auth Data API token is required";
export const MISSING_MAPPING_MESSAGE =
    "Neon returned no app user mapping. Apply prisma/app-user-mapping.sql with pnpm run db:app-user.";

//Redis
/** Max submissions per client IP per form within PER_FORM_WINDOW (login + register). */
export const PER_FORM_LIMIT = 5;
export const PER_FORM_WINDOW = "1 m" as const;

/** Max submissions per client IP across all forms within GLOBAL_WINDOW. */
export const GLOBAL_LIMIT = 30;
export const GLOBAL_WINDOW = "1 h" as const;

/**
 * Max attempts per identifier (email) within IDENTIFIER_WINDOW.
 * Keep this generous: an attacker can deliberately burn a victim's budget
 * (account lock-out DoS), so it should only stop sustained guessing.
 */
export const IDENTIFIER_LIMIT = 50;
export const IDENTIFIER_WINDOW = "15 m" as const;

/** Allow the request if Redis does not answer within this many ms (fail-open). */
export const REDIS_TIMEOUT_MS = 1500;

/** Caps the form name used inside Redis keys so keys can never grow unbounded. */
export const MAX_SLUG_KEY_LENGTH = 64;
