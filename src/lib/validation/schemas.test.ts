import { describe, expect, it } from "vitest";

import {
    MAX_CATEGORY_LENGTH,
    MAX_CURSOR_LENGTH,
    MAX_EMAIL_LENGTH,
    MAX_NAME_LENGTH,
    MAX_PASS_LENGTH,
    MAX_PRODUCT_ID_LENGTH,
    MAX_QTY_PER_ITEM,
    MIN_PASS_LENGTH,
    PAGE_SIZE,
} from "../constants";
import {
    addToCartSchema,
    loginSchema,
    productIdSchema,
    productQuerySchema,
    registerSchema,
    updateCartSchema,
    wishlistSchema,
} from "./schemas";

function issuePaths(result: {
    success: boolean;
    error?: { issues: { path: PropertyKey[] }[] };
}): string[] {
    if (result.success || !result.error) return [];
    return result.error.issues.map((i) => i.path.join("."));
}

/** Helper: returns every issue message from a failed parse. */
function issueMessages(result: {
    success: boolean;
    error?: { issues: { message: string }[] };
}): string[] {
    if (result.success || !result.error) return [];
    return result.error.issues.map((i) => i.message);
}

describe("productIdSchema", () => {
    it.each([
        "abc",
        "ABC-123",
        "prod_1",
        "a",
        "x".repeat(MAX_PRODUCT_ID_LENGTH),
    ])("accepts valid id %j", (id) => {
        expect(productIdSchema.safeParse(id).success).toBe(true);
    });

    it("rejects an empty string", () => {
        expect(productIdSchema.safeParse("").success).toBe(false);
    });

    it(`rejects ids longer than ${MAX_PRODUCT_ID_LENGTH} characters`, () => {
        expect(
            productIdSchema.safeParse("x".repeat(MAX_PRODUCT_ID_LENGTH + 1))
                .success,
        ).toBe(false);
    });

    // Includes injection-style payloads.
    it.each([
        "has space",
        "semi;colon",
        "../etc/passwd",
        "<script>",
        "a' OR '1'='1",
        "emoji🙂",
        "new\nline",
    ])(
        "rejects id with illegal characters %j and reports the custom message",
        (id) => {
            const result = productIdSchema.safeParse(id);
            expect(result.success).toBe(false);
            expect(issueMessages(result)).toContain("Invalid product id");
        },
    );

    it.each([123, null, undefined, {}, [], true])(
        "rejects non-string input %j",
        (value) => {
            expect(productIdSchema.safeParse(value).success).toBe(false);
        },
    );

    it("does not trim: surrounding whitespace is rejected rather than silently fixed", () => {
        expect(productIdSchema.safeParse(" abc ").success).toBe(false);
    });
});

describe("registerSchema", () => {
    const valid = {
        name: "Alice",
        email: "alice@example.com",
        password: "password1",
    };

    it("accepts a valid payload", () => {
        const result = registerSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    it("returns only the declared keys (unknown keys are stripped, preventing mass-assignment)", () => {
        const result = registerSchema.safeParse({
            ...valid,
            role: "admin",
            isAdmin: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(Object.keys(result.data).sort()).toEqual([
                "email",
                "name",
                "password",
            ]);
        }
    });

    describe("name", () => {
        it("trims surrounding whitespace", () => {
            const result = registerSchema.safeParse({
                ...valid,
                name: "   Alice   ",
            });
            expect(result.success && result.data.name).toBe("Alice");
        });

        it(`accepts the minimum length (2) and maximum length (${MAX_NAME_LENGTH})`, () => {
            expect(
                registerSchema.safeParse({ ...valid, name: "Al" }).success,
            ).toBe(true);
            expect(
                registerSchema.safeParse({
                    ...valid,
                    name: "a".repeat(MAX_NAME_LENGTH),
                }).success,
            ).toBe(true);
        });

        it("rejects a 1-character name and reports the custom message", () => {
            const result = registerSchema.safeParse({ ...valid, name: "A" });
            expect(result.success).toBe(false);
            expect(issueMessages(result)).toContain(
                "Name must be at least 2 characters",
            );
        });

        it("rejects whitespace-only names (trim happens before the length check)", () => {
            expect(
                registerSchema.safeParse({ ...valid, name: "     " }).success,
            ).toBe(false);
        });

        it("rejects a 1-char name padded with spaces", () => {
            expect(
                registerSchema.safeParse({ ...valid, name: " A " }).success,
            ).toBe(false);
        });

        it(`rejects a name over ${MAX_NAME_LENGTH} characters`, () => {
            const result = registerSchema.safeParse({
                ...valid,
                name: "a".repeat(MAX_NAME_LENGTH + 1),
            });
            expect(issuePaths(result)).toContain("name");
        });
    });

    describe("email", () => {
        it("trims and lower-cases (normalisation prevents duplicate accounts by casing)", () => {
            const result = registerSchema.safeParse({
                ...valid,
                email: "  Alice@Example.COM  ",
            });
            expect(result.success && result.data.email).toBe(
                "alice@example.com",
            );
        });

        it.each([
            "not-an-email",
            "missing@tld",
            "@no-local.com",
            "two@@example.com",
            "spa ce@example.com",
            "",
        ])("rejects invalid email %j", (email) => {
            expect(registerSchema.safeParse({ ...valid, email }).success).toBe(
                false,
            );
        });

        it("reports the custom message for malformed emails", () => {
            const result = registerSchema.safeParse({
                ...valid,
                email: "nope",
            });
            expect(issueMessages(result)).toContain(
                "Enter a valid email address",
            );
        });

        it(`rejects emails longer than ${MAX_EMAIL_LENGTH} characters`, () => {
            const email = `${"a".repeat(MAX_EMAIL_LENGTH - 4)}@b.co`; // 255 chars total
            expect(registerSchema.safeParse({ ...valid, email }).success).toBe(
                false,
            );
        });
    });

    describe("password", () => {
        it("accepts the boundary lengths 8 and 128", () => {
            expect(
                registerSchema.safeParse({ ...valid, password: "abcdefg1" })
                    .success,
            ).toBe(true);
            expect(
                registerSchema.safeParse({
                    ...valid,
                    password: `${"a".repeat(127)}1`,
                }).success,
            ).toBe(true);
        });

        it(`rejects ${MIN_PASS_LENGTH - 1} characters with the custom message`, () => {
            const result = registerSchema.safeParse({
                ...valid,
                password: "abcde1x",
            });
            expect(issueMessages(result)).toContain(
                `Password must be at least ${MIN_PASS_LENGTH} characters`,
            );
        });

        it(`rejects ${MAX_PASS_LENGTH + 1} characters (bounded to prevent hashing-DoS with huge inputs)`, () => {
            const result = registerSchema.safeParse({
                ...valid,
                password: `${"a".repeat(MAX_PASS_LENGTH + 1)}`,
            });
            expect(issueMessages(result)).toContain(
                "Password must be at most 128 characters",
            );
        });

        it("requires at least one letter", () => {
            const result = registerSchema.safeParse({
                ...valid,
                password: "12345678",
            });
            expect(issueMessages(result)).toContain(
                "Password needs at least one letter",
            );
        });

        it("requires at least one number", () => {
            const result = registerSchema.safeParse({
                ...valid,
                password: "abcdefgh",
            });
            expect(issueMessages(result)).toContain(
                "Password needs at least one number",
            );
        });

        it("reports both composition errors when neither is satisfied", () => {
            const result = registerSchema.safeParse({
                ...valid,
                password: "!!!!!!!!",
            });
            const messages = issueMessages(result);
            expect(messages).toContain("Password needs at least one letter");
            expect(messages).toContain("Password needs at least one number");
        });

        it("does not trim passwords (leading/trailing spaces are significant)", () => {
            const result = registerSchema.safeParse({
                ...valid,
                password: "  abcdef1  ",
            });
            expect(result.success && result.data.password).toBe("  abcdef1  ");
        });
    });

    it("reports every missing field when given an empty object", () => {
        const paths = issuePaths(registerSchema.safeParse({}));
        expect(paths).toEqual(
            expect.arrayContaining(["name", "email", "password"]),
        );
    });

    it.each([null, undefined, "string", 42, []])(
        "rejects non-object input %j",
        (input) => {
            expect(registerSchema.safeParse(input).success).toBe(false);
        },
    );
});

describe("loginSchema", () => {
    it("accepts valid credentials and normalises the email", () => {
        const result = loginSchema.safeParse({
            email: " USER@Example.com ",
            password: "anything",
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.email).toBe("user@example.com");
    });

    it("rejects an empty password", () => {
        expect(
            issuePaths(
                loginSchema.safeParse({ email: "a@b.co", password: "" }),
            ),
        ).toContain("password");
    });

    it(`rejects passwords over ${MAX_PASS_LENGTH} characters`, () => {
        expect(
            loginSchema.safeParse({
                email: "a@b.co",
                password: "a".repeat(MAX_PASS_LENGTH + 1),
            }).success,
        ).toBe(false);
    });

    it("rejects an invalid email", () => {
        expect(
            issuePaths(loginSchema.safeParse({ email: "bad", password: "pw" })),
        ).toContain("email");
    });

    it("rejects an email over 254 characters", () => {
        expect(
            loginSchema.safeParse({
                email: `${"a".repeat(MAX_EMAIL_LENGTH - 4)}@b.co`,
                password: "pw",
            }).success,
        ).toBe(false);
    });

    it("strips unknown keys", () => {
        const result = loginSchema.safeParse({
            email: "a@b.co",
            password: "password",
            remember: true,
        });
        expect(result.success && Object.keys(result.data).sort()).toEqual([
            "email",
            "password",
        ]);
    });
});

describe("addToCartSchema", () => {
    it("defaults quantity to 1 when omitted", () => {
        const result = addToCartSchema.safeParse({ productId: "abc" });
        expect(result.success && result.data.quantity).toBe(1);
    });

    it("accepts boundary quantities 1 and MAX_QTY_PER_ITEM", () => {
        expect(
            addToCartSchema.safeParse({ productId: "abc", quantity: 1 })
                .success,
        ).toBe(true);
        expect(
            addToCartSchema.safeParse({
                productId: "abc",
                quantity: MAX_QTY_PER_ITEM,
            }).success,
        ).toBe(true);
    });

    it("rejects 0, negative, and over-max quantities", () => {
        for (const quantity of [0, -1, MAX_QTY_PER_ITEM + 1]) {
            expect(
                issuePaths(
                    addToCartSchema.safeParse({ productId: "abc", quantity }),
                ),
            ).toContain("quantity");
        }
    });

    it("coerces numeric strings (form / query-string input)", () => {
        const result = addToCartSchema.safeParse({
            productId: "abc",
            quantity: "3",
        });
        expect(result.success && result.data.quantity).toBe(3);
    });

    it.each([1.5, "1.5", "abc", NaN, Infinity, "NaN"])(
        "rejects non-integer / non-numeric quantity %j",
        (quantity) => {
            expect(
                addToCartSchema.safeParse({ productId: "abc", quantity })
                    .success,
            ).toBe(false);
        },
    );

    it("rejectws empty string and null", () => {
        expect(
            addToCartSchema.safeParse({ productId: "abc", quantity: "" })
                .success,
        ).toBe(false);
        expect(
            addToCartSchema.safeParse({ productId: "abc", quantity: null })
                .success,
        ).toBe(false);
    });

    it("rejects an invalid productId even when quantity is valid", () => {
        expect(
            issuePaths(
                addToCartSchema.safeParse({ productId: "bad id", quantity: 1 }),
            ),
        ).toContain("productId");
    });

    it("rejects a missing productId", () => {
        expect(
            issuePaths(addToCartSchema.safeParse({ quantity: 1 })),
        ).toContain("productId");
    });
});

describe("updateCartSchema", () => {
    it("allows quantity 0, which means 'remove this line'", () => {
        const result = updateCartSchema.safeParse({
            productId: "abc",
            quantity: 0,
        });
        expect(result.success && result.data.quantity).toBe(0);
    });

    it("accepts the maximum quantity and rejects max + 1", () => {
        expect(
            updateCartSchema.safeParse({
                productId: "abc",
                quantity: MAX_QTY_PER_ITEM,
            }).success,
        ).toBe(true);
        expect(
            updateCartSchema.safeParse({
                productId: "abc",
                quantity: MAX_QTY_PER_ITEM + 1,
            }).success,
        ).toBe(false);
    });

    it("rejects negative and fractional quantities", () => {
        expect(
            updateCartSchema.safeParse({ productId: "abc", quantity: -1 })
                .success,
        ).toBe(false);
        expect(
            updateCartSchema.safeParse({ productId: "abc", quantity: 2.5 })
                .success,
        ).toBe(false);
    });

    it("has no default: a missing quantity is an error (unlike addToCartSchema)", () => {
        expect(
            issuePaths(updateCartSchema.safeParse({ productId: "abc" })),
        ).toContain("quantity");
    });

    it("coerces numeric strings", () => {
        const result = updateCartSchema.safeParse({
            productId: "abc",
            quantity: "4",
        });
        expect(result.success && result.data.quantity).toBe(4);
    });

    it("rejects non-numeric strings", () => {
        expect(
            updateCartSchema.safeParse({ productId: "abc", quantity: "abc" })
                .success,
        ).toBe(false);
    });
});

describe("wishlistSchema", () => {
    it("accepts a valid productId", () => {
        expect(wishlistSchema.safeParse({ productId: "abc" }).success).toBe(
            true,
        );
    });

    it("rejects missing or invalid productId", () => {
        expect(wishlistSchema.safeParse({}).success).toBe(false);
        expect(wishlistSchema.safeParse({ productId: "bad id" }).success).toBe(
            false,
        );
    });

    it("strips unknown keys", () => {
        const result = wishlistSchema.safeParse({
            productId: "abc",
            userId: "evil",
        });
        expect(result.success && Object.keys(result.data)).toEqual([
            "productId",
        ]);
    });
});

describe("productQuerySchema", () => {
    describe("defaults", () => {
        it(`applies sort='newest' and limit=${PAGE_SIZE} for an empty query`, () => {
            const result = productQuerySchema.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.sort).toBe("newest");
                expect(result.data.limit).toBe(PAGE_SIZE);
                expect(result.data.q).toBeUndefined();
                expect(result.data.category).toBeUndefined();
                expect(result.data.min).toBeUndefined();
                expect(result.data.max).toBeUndefined();
                expect(result.data.nextCursor).toBeUndefined();
            }
        });
    });

    describe("q (search text)", () => {
        it("trims the search string", () => {
            const result = productQuerySchema.safeParse({ q: "  shoes  " });
            expect(result.success && result.data.q).toBe("shoes");
        });

        it(`accepts ${MAX_PRODUCT_ID_LENGTH} characters and rejects ${MAX_PRODUCT_ID_LENGTH + 1}`, () => {
            expect(
                productQuerySchema.safeParse({
                    q: "a".repeat(MAX_PRODUCT_ID_LENGTH),
                }).success,
            ).toBe(true);
            expect(
                productQuerySchema.safeParse({
                    q: "a".repeat(MAX_PRODUCT_ID_LENGTH + 1),
                }).success,
            ).toBe(false);
        });

        it("documents current behaviour: whitespace-only q becomes '' (not undefined); callers must treat '' as 'no filter'", () => {
            const result = productQuerySchema.safeParse({ q: "   " });
            expect(result.success && result.data.q).toBe("");
        });
    });

    describe("category", () => {
        it("accepts a valid slug", () => {
            expect(
                productQuerySchema.safeParse({ category: "home-garden" })
                    .success,
            ).toBe(true);
        });

        it("rejects characters outside the allowed pattern", () => {
            expect(
                productQuerySchema.safeParse({ category: "home garden" })
                    .success,
            ).toBe(false);
            expect(
                productQuerySchema.safeParse({ category: "a;DROP TABLE" })
                    .success,
            ).toBe(false);
        });

        it(`accepts ${MAX_CATEGORY_LENGTH} characters and rejects ${MAX_CATEGORY_LENGTH + 1}`, () => {
            expect(
                productQuerySchema.safeParse({
                    category: "a".repeat(MAX_CATEGORY_LENGTH),
                }).success,
            ).toBe(true);
            expect(
                productQuerySchema.safeParse({
                    category: "a".repeat(MAX_CATEGORY_LENGTH + 1),
                }).success,
            ).toBe(false);
        });
    });

    describe("min / max price", () => {
        it("coerces numeric strings from the query string", () => {
            const result = productQuerySchema.safeParse({
                min: "10",
                max: "99.5",
            });
            expect(
                result.success && [result.data.min, result.data.max],
            ).toEqual([10, 99.5]);
        });

        it("accepts 0 and 1,000,000 as boundaries", () => {
            expect(
                productQuerySchema.safeParse({ min: 0, max: 1_000_000 })
                    .success,
            ).toBe(true);
        });

        it("rejects negative values", () => {
            expect(
                issuePaths(productQuerySchema.safeParse({ min: -1 })),
            ).toContain("min");
        });

        it("rejects NaN, Infinity and non-numeric strings", () => {
            for (const value of [NaN, Infinity, "abc", "Infinity"]) {
                expect(
                    productQuerySchema.safeParse({ min: value }).success,
                ).toBe(false);
            }
        });

        it("turns empty price string to undefined", () => {
            const result = productQuerySchema.safeParse({ min: "" });
            expect(result.success && result.data.min).toBe(undefined);
        });

        it("accepts min === max", () => {
            expect(
                productQuerySchema.safeParse({ min: 50, max: 50 }).success,
            ).toBe(true);
        });

        it("rejects min > max and attaches the error to the 'min' path with the custom message", () => {
            const result = productQuerySchema.safeParse({ min: 100, max: 10 });
            expect(result.success).toBe(false);
            expect(issuePaths(result)).toContain("min");
            expect(issueMessages(result)).toContain(
                "Minimum price cannot be greater than maximum price.",
            );
        });

        it("skips the range check when only one bound is provided", () => {
            expect(productQuerySchema.safeParse({ min: 999_999 }).success).toBe(
                true,
            );
            expect(productQuerySchema.safeParse({ max: 0 }).success).toBe(true);
        });

        it("compares numerically, not lexicographically ('9' <= '10')", () => {
            expect(
                productQuerySchema.safeParse({ min: "9", max: "10" }).success,
            ).toBe(true);
        });
    });

    describe("sort", () => {
        it.each(["newest", "price-asc", "price-desc"])("accepts %s", (sort) => {
            expect(productQuerySchema.safeParse({ sort }).success).toBe(true);
        });

        it("rejects unknown sort keys (whitelist prevents injection into ORDER BY)", () => {
            expect(
                productQuerySchema.safeParse({ sort: "price; DROP TABLE" })
                    .success,
            ).toBe(false);
            expect(
                productQuerySchema.safeParse({ sort: "oldest" }).success,
            ).toBe(false);
        });
    });

    describe("limit", () => {
        it("accepts boundaries 1 and 48", () => {
            expect(productQuerySchema.safeParse({ limit: 1 }).success).toBe(
                true,
            );
            expect(productQuerySchema.safeParse({ limit: 48 }).success).toBe(
                true,
            );
        });

        it("rejects 0, 49, negatives and fractions (caps page size to protect the DB)", () => {
            for (const limit of [0, 49, -5, 2.5]) {
                expect(
                    issuePaths(productQuerySchema.safeParse({ limit })),
                ).toContain("limit");
            }
        });

        it("coerces numeric strings", () => {
            const result = productQuerySchema.safeParse({ limit: "24" });
            expect(result.success && result.data.limit).toBe(24);
        });
    });

    describe("cursor", () => {
        it(`accepts up to ${MAX_CURSOR_LENGTH} characters and rejects ${MAX_CURSOR_LENGTH + 1}`, () => {
            expect(
                productQuerySchema.safeParse({
                    nextCursor: "c".repeat(MAX_CURSOR_LENGTH),
                }).success,
            ).toBe(true);
            expect(
                productQuerySchema.safeParse({
                    nextCursor: "c".repeat(MAX_CURSOR_LENGTH + 1),
                }).success,
            ).toBe(false);
        });
    });

    it("bad values fail validation", () => {
        const result = productQuerySchema.safeParse({
            sort: "bogus",
            limit: 9999,
        });
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toEqual(
            expect.arrayContaining(["sort", "limit"]),
        );
    });

    it("strips unknown query parameters", () => {
        const result = productQuerySchema.safeParse({
            q: "x",
            utm_source: "spam",
        });
        expect(result.success && "utm_source" in result.data).toBe(false);
    });

    it("parses a realistic full query string payload", () => {
        const result = productQuerySchema.safeParse({
            q: "  running shoes ",
            category: "footwear",
            min: "20",
            max: "200",
            sort: "price-asc",
            limit: "24",
            nextCursor: "abc123",
            prevCursor: "blabla",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({
                q: "running shoes",
                category: "footwear",
                min: 20,
                max: 200,
                sort: "price-asc",
                limit: 24,
                nextCursor: "abc123",
                prevCursor: "blabla",
            });
        }
    });
});

describe("RegisterInput type", () => {
    it("matches the parsed output shape of registerSchema", () => {
        const result = registerSchema.safeParse({
            name: "Al",
            email: "a@b.co",
            password: "abcdefg1",
        });
        if (result.success) {
            const data: import("./schemas").RegisterInput = result.data;
            expect(data.name).toBe("Al");
        } else {
            throw new Error("expected a successful parse");
        }
    });
});
