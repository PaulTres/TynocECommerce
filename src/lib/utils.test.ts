import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    MockInstance,
    vi,
} from "vitest";
import { ValidationError } from "./errors";
import {
    asIso,
    assertValidPriceRange,
    decodeCursor,
    encodeCursor,
    first,
    formatPrice,
    getPaginationUrl,
    isInteger,
    isNaturalNumber,
    isValidPriceRange,
    safeRedirectPath,
    slugify,
    tooManyAttemptsMessage,
    toStringArray,
} from "./utils";

import { ParsedProductQuery } from "./validation/schemas";

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});
describe("asIso", () => {
    beforeEach(() => {
        consoleErrorSpy.mockClear();
    });

    it("converts a Date object to an ISO string", () => {
        const date = new Date("2025-01-15T12:30:00.000Z");

        expect(asIso(date)).toBe("2025-01-15T12:30:00.000Z");
    });

    it("converts a valid date string to an ISO string", () => {
        expect(asIso("2025-01-15T12:30:00.000Z")).toBe(
            "2025-01-15T12:30:00.000Z",
        );
    });

    it("returns unknown for invalid date strings", () => {
        expect(asIso("invalid-date")).toBe("unknown");
        expect(consoleErrorSpy).toHaveBeenCalledOnce();
    });

    it("returns unknown for unsupported value types", () => {
        expect(asIso(12345)).toBe("unknown");
        expect(asIso(null)).toBe("unknown");
        expect(asIso(undefined)).toBe("unknown");
        expect(asIso({})).toBe("unknown");
    });

    it("does not log errors for valid values", () => {
        expect(asIso("2025-01-15")).toBe(new Date("2025-01-15").toISOString());

        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});

describe("formatPrice", () => {
    it("formats USD cents using the default currency", () => {
        expect(formatPrice(1999)).toBe("$19.99");
    });

    it("formats zero cents", () => {
        expect(formatPrice(0)).toBe("$0.00");
    });

    it("formats whole dollar amounts", () => {
        expect(formatPrice(10000)).toBe("$100.00");
    });

    it("formats negative amounts", () => {
        expect(formatPrice(-1999)).toBe("-$19.99");
    });

    it("supports other currencies", () => {
        expect(formatPrice(1999, "EUR")).toBe("€19.99");
        expect(formatPrice(1999, "GBP")).toBe("£19.99");
    });

    it("formats large amounts", () => {
        expect(formatPrice(123456789)).toBe("$1,234,567.89");
    });

    it("throws when given an invalid currency code", () => {
        expect(() => formatPrice(1000, "INVALID")).toThrow(RangeError);
    });
});

describe("slugify", () => {
    it("lowercases the input", () => {
        expect(slugify("HELLO WORLD")).toBe("hello-world");
    });

    it("replaces spaces with hyphens", () => {
        expect(slugify("hello world example")).toBe("hello-world-example");
    });

    it("removes accents and diacritical marks", () => {
        expect(slugify("café résumé")).toBe("cafe-resume");
    });

    it("normalizes accented uppercase characters", () => {
        expect(slugify("ÉLÈVE")).toBe("eleve");
    });

    it("replaces special characters with hyphens", () => {
        expect(slugify("hello@world!test#123")).toBe("hello-world-test-123");
    });

    it("collapses consecutive non-alphanumeric characters", () => {
        expect(slugify("hello   ---   world")).toBe("hello-world");
    });

    it("removes leading and trailing hyphens", () => {
        expect(slugify("---hello-world---")).toBe("hello-world");
    });

    it("returns an empty string for an empty input", () => {
        expect(slugify("")).toBe("");
    });

    it("returns an empty string when input contains only special characters", () => {
        expect(slugify("!@#$%^&*()")).toBe("");
    });

    it("preserves numbers", () => {
        expect(slugify("Product 123 Version 2")).toBe("product-123-version-2");
    });
});

describe("safeRedirectPath", () => {
    it("allows a valid relative path", () => {
        expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    });

    it("allows nested relative paths", () => {
        expect(safeRedirectPath("/account/settings")).toBe("/account/settings");
    });

    it("allows relative paths containing query parameters", () => {
        expect(safeRedirectPath("/dashboard?tab=profile")).toBe(
            "/dashboard?tab=profile",
        );
    });

    it("allows relative paths containing fragments", () => {
        expect(safeRedirectPath("/dashboard#section")).toBe(
            "/dashboard#section",
        );
    });

    it("returns the default fallback for null", () => {
        expect(safeRedirectPath(null)).toBe("/");
    });

    it("returns the default fallback for undefined", () => {
        expect(safeRedirectPath(undefined)).toBe("/");
    });

    it("returns the default fallback for an empty string", () => {
        expect(safeRedirectPath("")).toBe("/");
    });

    it("rejects absolute URLs", () => {
        expect(safeRedirectPath("https://example.com")).toBe("/");
    });

    it("rejects protocol-relative URLs", () => {
        expect(safeRedirectPath("//example.com")).toBe("/");
    });

    it("rejects paths containing backslashes", () => {
        expect(safeRedirectPath("/\\example.com")).toBe("/");
    });

    it("rejects paths containing backslashes anywhere", () => {
        expect(safeRedirectPath("/dashboard\\admin")).toBe("/");
    });

    it("supports a custom fallback", () => {
        expect(safeRedirectPath("https://example.com", "/login")).toBe(
            "/login",
        );
    });

    it("uses the custom fallback for empty targets", () => {
        expect(safeRedirectPath(null, "/home")).toBe("/home");
    });
});

describe("isInteger", () => {
    it("returns true for positive integers", () => {
        expect(isInteger(1)).toBe(true);
        expect(isInteger(100)).toBe(true);
    });

    it("returns true for zero", () => {
        expect(isInteger(0)).toBe(true);
    });

    it("returns true for negative integers", () => {
        expect(isInteger(-1)).toBe(true);
        expect(isInteger(-100)).toBe(true);
    });

    it("returns false for positive decimals", () => {
        expect(isInteger(1.5)).toBe(false);
        expect(isInteger(10.99)).toBe(false);
    });

    it("returns false for negative decimals", () => {
        expect(isInteger(-1.5)).toBe(false);
    });

    it("returns false for NaN", () => {
        expect(isInteger(NaN)).toBe(false);
    });

    it("returns false for Infinity", () => {
        expect(isInteger(Infinity)).toBe(false);
        expect(isInteger(-Infinity)).toBe(false);
    });
});

describe("isNaturalNumber", () => {
    it("returns true for zero", () => {
        expect(isNaturalNumber(0)).toBe(true);
    });

    it("returns true for zero when allowZero is true", () => {
        expect(isNaturalNumber(0, true)).toBe(true);
    });

    it("returns false for zero when allowZero is false", () => {
        expect(isNaturalNumber(0, false)).toBe(false);
    });

    it("returns true for positive integers", () => {
        expect(isNaturalNumber(1)).toBe(true);
        expect(isNaturalNumber(100)).toBe(true);
    });

    it("returns false for negative integers", () => {
        expect(isNaturalNumber(-1)).toBe(false);
        expect(isNaturalNumber(-100)).toBe(false);
    });

    it("returns false for decimals", () => {
        expect(isNaturalNumber(1.5)).toBe(false);
        expect(isNaturalNumber(0.5)).toBe(false);
    });

    it("returns false for NaN", () => {
        expect(isNaturalNumber(NaN)).toBe(false);
    });

    it("returns false for Infinity", () => {
        expect(isNaturalNumber(Infinity)).toBe(false);
    });
});

describe("decodeCursor", () => {
    it("decodes a valid base64url cursor", () => {
        const cursor = Buffer.from(JSON.stringify("user-123"), "utf8").toString(
            "base64url",
        );

        expect(decodeCursor(cursor)).toBe("user-123");
    });

    it("returns undefined when cursor is undefined", () => {
        expect(decodeCursor()).toBeUndefined();
    });

    it("returns undefined when cursor is an empty string", () => {
        expect(decodeCursor("")).toBeUndefined();
    });

    it("throws ValidationError for invalid JSON", () => {
        const cursor = Buffer.from("invalid-json").toString("base64url");

        expect(() => decodeCursor(cursor)).toThrow(ValidationError);
        expect(() => decodeCursor(cursor)).toThrow("Invalid pagination cursor");
    });

    it("throws ValidationError when decoded JSON is a number", () => {
        const cursor = Buffer.from(JSON.stringify(123)).toString("base64url");

        expect(() => decodeCursor(cursor)).toThrow(ValidationError);
    });

    it("throws ValidationError when decoded JSON is null", () => {
        const cursor = Buffer.from(JSON.stringify(null)).toString("base64url");

        expect(() => decodeCursor(cursor)).toThrow(ValidationError);
    });

    it("throws ValidationError when decoded JSON is an object", () => {
        const cursor = Buffer.from(JSON.stringify({ id: "user-123" })).toString(
            "base64url",
        );

        expect(() => decodeCursor(cursor)).toThrow(ValidationError);
    });

    it("throws ValidationError when decoded JSON is an empty string", () => {
        const cursor = Buffer.from(JSON.stringify("")).toString("base64url");

        expect(() => decodeCursor(cursor)).toThrow(ValidationError);
    });

    it("throws ValidationError when cursor contains invalid base64url data", () => {
        expect(() => decodeCursor("%%%")).toThrow(ValidationError);
    });
});

describe("encodeCursor", () => {
    it("encodes a string ID into a base64url cursor", () => {
        const cursor = encodeCursor("user-123");

        expect(cursor).toBe(
            Buffer.from(JSON.stringify("user-123"), "utf8").toString(
                "base64url",
            ),
        );
    });

    it("returns undefined when ID is undefined", () => {
        expect(encodeCursor()).toBeUndefined();
    });

    it("returns undefined when ID is an empty string", () => {
        expect(encodeCursor("")).toBeUndefined();
    });

    it("encodes IDs containing special characters", () => {
        const id = "user/123?name=test";

        expect(encodeCursor(id)).toBe(
            Buffer.from(JSON.stringify(id), "utf8").toString("base64url"),
        );
    });

    it("supports Unicode IDs", () => {
        const id = "usuario-ñ-東京";

        expect(encodeCursor(id)).toBe(
            Buffer.from(JSON.stringify(id), "utf8").toString("base64url"),
        );
    });

    it("produces a cursor that can be decoded back to the original ID", () => {
        const id = "user-123";

        expect(decodeCursor(encodeCursor(id))).toBe(id);
    });
});

describe("toStringArray", () => {
    it("returns an array of strings unchanged", () => {
        expect(toStringArray(["one", "two"])).toEqual(["one", "two"]);
    });

    it("converts numbers to strings", () => {
        expect(toStringArray([1, 2, 3])).toEqual(["1", "2", "3"]);
    });

    it("converts mixed values to strings", () => {
        expect(toStringArray([1, "two", true, null, undefined])).toEqual([
            "1",
            "two",
            "true",
            "null",
            "undefined",
        ]);
    });

    it("returns an empty array for undefined", () => {
        expect(toStringArray(undefined)).toEqual([]);
    });

    it("returns an empty array for null", () => {
        expect(toStringArray(null)).toEqual([]);
    });

    it("returns an empty array for a string", () => {
        expect(toStringArray("hello")).toEqual([]);
    });

    it("returns an empty array for an object", () => {
        expect(toStringArray({ value: 1 })).toEqual([]);
    });

    it("returns an empty array for a number", () => {
        expect(toStringArray(123)).toEqual([]);
    });

    it("returns an empty array for a boolean", () => {
        expect(toStringArray(true)).toEqual([]);
    });

    it("returns an empty array for an empty array", () => {
        expect(toStringArray([])).toEqual([]);
    });

    it("converts nested arrays and objects using String", () => {
        expect(toStringArray([[1, 2], { id: 1 }])).toEqual([
            "1,2",
            "[object Object]",
        ]);
    });
});

describe("isValidPriceRange", () => {
    it("returns true when both prices are undefined", () => {
        expect(isValidPriceRange()).toBe(true);
    });

    it("returns true when minimum price is undefined", () => {
        expect(isValidPriceRange(undefined, 1000)).toBe(true);
    });

    it("returns true when maximum price is undefined", () => {
        expect(isValidPriceRange(1000, undefined)).toBe(true);
    });

    it("returns true when minimum price is less than maximum price", () => {
        expect(isValidPriceRange(1000, 2000)).toBe(true);
    });

    it("returns true when minimum price equals maximum price", () => {
        expect(isValidPriceRange(1000, 1000)).toBe(true);
    });

    it("returns false when minimum price exceeds maximum price", () => {
        expect(isValidPriceRange(2000, 1000)).toBe(false);
    });

    it("handles zero as a valid price", () => {
        expect(isValidPriceRange(0, 1000)).toBe(true);
        expect(isValidPriceRange(0, 0)).toBe(true);
    });
});

describe("assertValidPriceRange", () => {
    it("does not throw when both prices are undefined", () => {
        expect(() => assertValidPriceRange()).not.toThrow();
    });

    it("does not throw when minimum price is undefined", () => {
        expect(() => assertValidPriceRange(undefined, 1000)).not.toThrow();
    });

    it("does not throw when maximum price is undefined", () => {
        expect(() => assertValidPriceRange(1000, undefined)).not.toThrow();
    });

    it("does not throw when minimum price is less than maximum price", () => {
        expect(() => assertValidPriceRange(1000, 2000)).not.toThrow();
    });

    it("does not throw when minimum price equals maximum price", () => {
        expect(() => assertValidPriceRange(1000, 1000)).not.toThrow();
    });

    it("throws ValidationError when minimum price exceeds maximum price", () => {
        expect(() => assertValidPriceRange(2000, 1000)).toThrow(
            ValidationError,
        );
    });

    it("throws with the expected error message", () => {
        expect(() => assertValidPriceRange(2000, 1000)).toThrow(
            "Minimum price cannot be greater than maximum price",
        );
    });
});

describe("first", () => {
    it("returns the string when given a single string", () => {
        expect(first("hello")).toBe("hello");
    });

    it("returns the first value when given an array", () => {
        expect(first(["hello", "world"])).toBe("hello");
    });

    it("returns the first value when given an array with multiple values", () => {
        expect(first(["first", "second", "third"])).toBe("first");
    });

    it("returns undefined when given an empty array", () => {
        expect(first([])).toBeUndefined();
    });

    it("returns undefined when given undefined", () => {
        expect(first(undefined)).toBeUndefined();
    });
});

describe("getPaginationUrl", () => {
    const baseQuery: ParsedProductQuery = {
        q: "laptop",
        category: "electronics",
        min: 1000,
        max: 5000,
        sort: "price-asc",
        limit: 24,
    };

    it("returns undefined when cursor is undefined", () => {
        expect(getPaginationUrl(baseQuery, "nextCursor")).toBeUndefined();
    });

    it("returns undefined when cursor is an empty string", () => {
        expect(getPaginationUrl(baseQuery, "nextCursor", "")).toBeUndefined();
    });

    it("generates a URL with a next cursor", () => {
        const result = getPaginationUrl(baseQuery, "nextCursor", "cursor123");

        expect(result).toContain("/products?");
        expect(result).toContain("nextCursor=cursor123");
    });

    it("generates a URL with a previous cursor", () => {
        const result = getPaginationUrl(baseQuery, "prevCursor", "cursor456");

        expect(result).toContain("/products?");
        expect(result).toContain("prevCursor=cursor456");
    });

    it("preserves all existing query parameters", () => {
        const result = getPaginationUrl(baseQuery, "nextCursor", "cursor123");

        const params = new URLSearchParams(result?.split("?")[1]);

        expect(params.get("q")).toBe("laptop");
        expect(params.get("category")).toBe("electronics");
        expect(params.get("min")).toBe("1000");
        expect(params.get("max")).toBe("5000");
        expect(params.get("sort")).toBe("price-asc");
        expect(params.get("limit")).toBe("24");
        expect(params.get("nextCursor")).toBe("cursor123");
    });

    it("excludes existing pagination cursors", () => {
        const query: ParsedProductQuery = {
            ...baseQuery,
            nextCursor: "old-next",
            prevCursor: "old-prev",
        };

        const result = getPaginationUrl(query, "nextCursor", "new-next");

        const params = new URLSearchParams(result?.split("?")[1]);

        expect(params.get("nextCursor")).toBe("new-next");
        expect(params.has("prevCursor")).toBe(false);
    });

    it("excludes undefined values", () => {
        const query: ParsedProductQuery = {
            ...baseQuery,
            q: undefined,
            category: undefined,
            min: undefined,
            max: undefined,
        };

        const result = getPaginationUrl(query, "nextCursor", "cursor123");

        const params = new URLSearchParams(result?.split("?")[1]);

        expect(params.has("q")).toBe(false);
        expect(params.has("category")).toBe(false);
        expect(params.has("min")).toBe(false);
        expect(params.has("max")).toBe(false);
    });

    it("converts numeric values to strings", () => {
        const result = getPaginationUrl(baseQuery, "nextCursor", "cursor123");

        const params = new URLSearchParams(result?.split("?")[1]);

        expect(params.get("min")).toBe("1000");
        expect(params.get("max")).toBe("5000");
        expect(params.get("limit")).toBe("24");
    });

    it("URL-encodes special characters in query values", () => {
        const query: ParsedProductQuery = {
            ...baseQuery,
            q: "gaming laptop & accessories",
        };

        const result = getPaginationUrl(query, "nextCursor", "cursor 123");

        expect(result).toContain("q=gaming+laptop+%26+accessories");
        expect(result).toContain("nextCursor=cursor+123");
    });

    it("changes only the pagination cursor between requests", () => {
        const nextUrl = getPaginationUrl(baseQuery, "nextCursor", "next123");

        const prevUrl = getPaginationUrl(baseQuery, "prevCursor", "prev456");

        const nextParams = new URLSearchParams(nextUrl?.split("?")[1]);
        const prevParams = new URLSearchParams(prevUrl?.split("?")[1]);

        for (const key of ["q", "category", "min", "max", "sort", "limit"]) {
            expect(nextParams.get(key)).toBe(prevParams.get(key));
        }

        expect(nextParams.get("nextCursor")).toBe("next123");
        expect(prevParams.get("prevCursor")).toBe("prev456");
    });

    it("handles a query containing only required/defaulted parameters", () => {
        const query: ParsedProductQuery = {
            sort: "newest",
            limit: 24,
        };

        const result = getPaginationUrl(query, "nextCursor", "cursor123");

        expect(result).toBe(
            "/products?sort=newest&limit=24&nextCursor=cursor123",
        );
    });
});

describe("tooManyAttemptsMessage", () => {
    it("formats retry delays shorter than one minute in seconds", async () => {
        expect(tooManyAttemptsMessage(30)).toBe(
            "Too many attempts. Please try again in 30 seconds.",
        );
    });

    it("formats exactly 59 seconds in seconds", async () => {
        expect(tooManyAttemptsMessage(59)).toBe(
            "Too many attempts. Please try again in 59 seconds.",
        );
    });

    it("formats exactly 60 seconds in minutes", async () => {
        expect(tooManyAttemptsMessage(60)).toBe(
            "Too many attempts. Please try again in 1 minutes.",
        );
    });

    it("rounds up partial minutes", async () => {
        expect(tooManyAttemptsMessage(61)).toBe(
            "Too many attempts. Please try again in 2 minutes.",
        );

        expect(tooManyAttemptsMessage(837)).toBe(
            "Too many attempts. Please try again in 14 minutes.",
        );
    });

    it("handles zero seconds", async () => {
        expect(tooManyAttemptsMessage(0)).toBe(
            "Too many attempts. Please try again in 0 seconds.",
        );
    });
});
