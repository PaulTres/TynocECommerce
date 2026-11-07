import { describe, expect, it } from "vitest";
import * as constants from "./constants";

describe("shared application limits", () => {
    it("defines the public store identity and input limits", () => {
        expect(constants.SITE_NAME).toBe("Parcel");
        expect(constants.MAX_QTY_PER_ITEM).toBe(100);
        expect(constants.STOCK_WARNING_THRESHOLD).toBe(5);
        expect(constants.PAGE_SIZE).toBeGreaterThan(0);
        expect(constants.API_LIMIT).toBeGreaterThan(0);
        expect(constants.MAX_PRODUCT_ID_LENGTH).toBeGreaterThan(0);
        expect(constants.MAX_NAME_LENGTH).toBeGreaterThan(0);
        expect(constants.MAX_EMAIL_LENGTH).toBeGreaterThan(0);
        expect(constants.MIN_PASS_LENGTH).toBeGreaterThan(0);
        expect(constants.MAX_PASS_LENGTH).toBeGreaterThan(constants.MIN_PASS_LENGTH);
        expect(constants.MAX_CATEGORY_LENGTH).toBeGreaterThan(0);
        expect(constants.MAX_CURSOR_LENGTH).toBeGreaterThan(0);
    });

    it("matches only product identifiers with permitted URL-safe segments", () => {
        expect(constants.PRODUCT_ID_PATTERN.test("linen-throw_2")).toBe(true);
        expect(constants.PRODUCT_ID_PATTERN.test("bad id")).toBe(false);
        expect(constants.PRODUCT_ID_PATTERN.test("invalid!id")).toBe(false);
    });

    it("keeps auth setup messages defined", () => {
        expect(constants.MISSING_AUTH_CLAIMS_MESSAGE).toContain("token is required");
        expect(constants.MISSING_MAPPING_MESSAGE).toContain("app-user-mapping.sql");
    });

    it("defines separate per-form, global, and identifier rate limits", () => {
        expect(constants.PER_FORM_LIMIT).toBeGreaterThan(0);
        expect(constants.GLOBAL_LIMIT).toBeGreaterThan(constants.PER_FORM_LIMIT);
        expect(constants.IDENTIFIER_LIMIT).toBeGreaterThan(constants.PER_FORM_LIMIT);
        expect(constants.PER_FORM_WINDOW).toBe("1 m");
        expect(constants.GLOBAL_WINDOW).toBe("1 h");
        expect(constants.IDENTIFIER_WINDOW).toBe("15 m");
        expect(constants.REDIS_TIMEOUT_MS).toBeGreaterThan(0);
        expect(constants.MAX_SLUG_KEY_LENGTH).toBeGreaterThan(0);
    });
});
