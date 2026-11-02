import clsx, { type ClassValue } from "clsx";

/**Builds css string from multiple inputs. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Formats integer cents as a localised currency string.
 */
export function formatPrice(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Lower-cases, strips accents and collapses non-alphanumerics into single hyphens. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Only allows same-site relative redirects (e.g. "/cart").
 * A `callbackUrl` taken from the query string could otherwise send users to a
 * malicious site after login.
 */
export function safeRedirectPath(target: string | null | undefined, fallback = "/"): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return fallback;
  }
  return target;
}
