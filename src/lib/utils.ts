import { ValidationError } from "./errors";

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

export const isNaturalNumber = (num: number) => isInteger(num) && num >= 0;

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
