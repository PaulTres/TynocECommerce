import { ValidationError } from "./errors";
import { ParsedProductQuery } from "./validation/schemas";
export { cn } from "cn";

export function asIso(value: Date | string | unknown): string {
    try {
        return value instanceof Date
            ? value.toISOString()
            : typeof value == "string"
              ? new Date(value).toISOString()
              : "unknown";
    } catch (e) {
        console.error(e);
        return "unknown";
    }
}

/** Formats integer cents as a localized currency string. */
export function formatPrice(cents: number, currency = "USD"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(cents / 100);
}

/** Lowercases, strips accents, and collapses non-alphanumerics into hyphens. */
export function slugify(input: string): string {
    return input
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Allows same-site relative redirects and falls back for unsafe targets. */
export function safeRedirectPath(
    target: string | null | undefined,
    fallback = "/",
): string {
    if (
        !target ||
        !target.startsWith("/") ||
        target.startsWith("//") ||
        target.includes("\\")
    ) {
        return fallback;
    }
    return target;
}

/**Truncates the decimal part of a number and returns the integer portion. */
export const isInteger = (num: number) => num === ~~num;

export const isNaturalNumber = (num: number, allowZero?: boolean) =>
    isInteger(num) &&
    (allowZero === undefined || allowZero ? num >= 0 : num > 0);

export function decodeCursor(cursor?: string): string | undefined {
    if (!cursor) return undefined;
    try {
        const id: unknown = JSON.parse(
            Buffer.from(cursor, "base64url").toString("utf8"),
        );
        if (typeof id === "string" && id.length > 0) return id;
    } catch {
        // Return the validation error below.
    }
    throw new ValidationError("Invalid pagination cursor");
}

export function encodeCursor(id?: string): string | undefined {
    return id
        ? Buffer.from(JSON.stringify(id), "utf8").toString("base64url")
        : undefined;
}

export function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
}

export function isValidPriceRange(min?: number, max?: number): boolean {
    return min === undefined || max === undefined || min <= max;
}

/**
 * @throws ValidationError when min > max.
 */
export function assertValidPriceRange(
    minPriceCents?: number,
    maxPriceCents?: number,
): void {
    if (!isValidPriceRange(minPriceCents, maxPriceCents)) {
        throw new ValidationError(
            "Minimum price cannot be greater than maximum price",
        );
    }
}

/** Next gives repeated params as arrays; we only support the first value of each. */
export const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

/**
 * Creates a pagination URL from validated filters and sorting.
 * Only the pagination cursor changes between navigation requests.
 */
export function getPaginationUrl(
    query: ParsedProductQuery,
    cursorName: "nextCursor" | "prevCursor",
    cursor?: string,
): string | undefined {
    if (!cursor) return undefined;

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        // Exclude existing pagination cursors and empty values.
        if (
            key !== "nextCursor" &&
            key !== "prevCursor" &&
            value !== undefined &&
            value !== ""
        ) {
            params.set(key, String(value));
        }
    }

    params.set(cursorName, cursor);

    return `/products?${params.toString()}`;
}
