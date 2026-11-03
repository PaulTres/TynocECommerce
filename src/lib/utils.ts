export { cn } from "cn"

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
