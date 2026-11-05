import { beforeEach, describe, expect, it, vi } from "vitest";

import * as cartRepo from "@/lib/db/cart.repo";
import * as productsRepo from "@/lib/db/products.repo";
import { ConflictError, NotFoundError } from "@/lib/errors";

import {
    addToCart,
    getCart,
    getCartCount,
    removeFromCart,
    updateQuantity,
} from "./cart.service";

/**
 * Module mocks
 * MAX_QTY_PER_ITEM is pinned to 10 so the tests do not break if the real
 * constant is tuned later; the cap logic is verified against this fixed value.
 */
vi.mock("@/lib/constants", () => ({ MAX_QTY_PER_ITEM: 10 }));

vi.mock("@/lib/db/cart.repo", () => ({
    listCartItems: vi.fn(),
    sumCartQuantities: vi.fn(),
    incrementItem: vi.fn(),
    setQuantity: vi.fn(),
    removeItem: vi.fn(),
}));

vi.mock("@/lib/db/products.repo", () => ({
    getProduct: vi.fn(),
    batchGetProducts: vi.fn(),
}));

/** Mirrors the pinned value in the constants mock above. */
const MAX_QTY = 10;

/**
 * Derive the entity types from the repository signatures so they follow any future repo type change.
 */
type Product = NonNullable<Awaited<ReturnType<typeof productsRepo.getProduct>>>;
type CartRow = Awaited<ReturnType<typeof cartRepo.listCartItems>>[number];

/**
 * Builds a product fixture with sensible defaults (plenty of stock, $10.00).
 * Tests override only the fields relevant to the scenario.
 */
function makeProduct(overrides: Record<string, unknown> = {}): Product {
    return {
        id: "p1",
        name: "Widget",
        priceCents: 1000,
        stock: 100,
        ...overrides,
    } as unknown as Product;
}

/** Builds a cart-row fixture (return type of cartRepo.listItems). */
function makeRow(productId: string, quantity: number): CartRow {
    return { productId, quantity } as unknown as CartRow;
}

const cartMocks = vi.mocked(cartRepo);
const productMocks = vi.mocked(productsRepo);

const USER_ID = "user-1";
const PRODUCT_ID = "p1";

beforeEach(() => {
    vi.resetAllMocks();
});

describe("getCart", () => {
    it("returns an empty cart with zero totals when the user has no rows", async () => {
        cartMocks.listCartItems.mockResolvedValue([]);
        productMocks.batchGetProducts.mockResolvedValue([]);

        const cart = await getCart(USER_ID);

        expect(cart).toEqual({
            lines: [],
            itemCount: 0,
            subtotalCents: 0,
            currency: "USD",
        });
    });

    it("scopes the cart query to the given user id", async () => {
        cartMocks.listCartItems.mockResolvedValue([]);
        productMocks.batchGetProducts.mockResolvedValue([]);

        await getCart(USER_ID);

        expect(cartMocks.listCartItems).toHaveBeenCalledTimes(1);
        expect(cartMocks.listCartItems).toHaveBeenCalledWith(USER_ID);
    });

    it("fetches all products in one batch call (no N+1 queries)", async () => {
        cartMocks.listCartItems.mockResolvedValue([
            makeRow("a", 1),
            makeRow("b", 2),
            makeRow("c", 3),
        ]);
        productMocks.batchGetProducts.mockResolvedValue([
            makeProduct({ id: "a" }),
            makeProduct({ id: "b" }),
            makeProduct({ id: "c" }),
        ]);

        await getCart(USER_ID);

        expect(productMocks.batchGetProducts).toHaveBeenCalledTimes(1);
        expect(productMocks.batchGetProducts).toHaveBeenCalledWith([
            "a",
            "b",
            "c",
        ]);

        expect(productMocks.getProduct).not.toHaveBeenCalled();
    });

    it("builds a line with the live product, quantity and line total", async () => {
        const product = makeProduct({ id: "p1", priceCents: 1999, stock: 10 });
        cartMocks.listCartItems.mockResolvedValue([makeRow("p1", 3)]);
        productMocks.batchGetProducts.mockResolvedValue([product]);

        const cart = await getCart(USER_ID);

        expect(cart.lines).toHaveLength(1);
        expect(cart.lines[0]).toEqual({
            product,
            quantity: 3,
            lineTotalCents: 5997, // 1999 * 3
            exceedsStock: false,
        });
    });

    it("uses the price from the product table (server-side source of truth)", async () => {
        cartMocks.listCartItems.mockResolvedValue([
            {
                productId: "p1",
                quantity: 2,
                priceCents: 1,
            } as unknown as CartRow,
        ]);
        productMocks.batchGetProducts.mockResolvedValue([
            makeProduct({ id: "p1", priceCents: 2500 }),
        ]);

        const cart = await getCart(USER_ID);

        expect(cart.lines[0].lineTotalCents).toBe(5000);
        expect(cart.subtotalCents).toBe(5000);
    });

    it("computes itemCount and subtotal across multiple lines", async () => {
        cartMocks.listCartItems.mockResolvedValue([
            makeRow("a", 2),
            makeRow("b", 1),
            makeRow("c", 5),
        ]);
        productMocks.batchGetProducts.mockResolvedValue([
            makeProduct({ id: "a", priceCents: 150 }), // 300
            makeProduct({ id: "b", priceCents: 999 }), // 999
            makeProduct({ id: "c", priceCents: 1 }), //   5
        ]);

        const cart = await getCart(USER_ID);

        expect(cart.itemCount).toBe(8);
        expect(cart.subtotalCents).toBe(1304);
        expect(cart.currency).toBe("USD");
    });

    it("keeps integer cents exact (no floating point drift)", async () => {
        // 0.1 + 0.2 style drift is impossible with integer cents, but this may be a useful guard in the future
        cartMocks.listCartItems.mockResolvedValue([
            makeRow("a", 3),
            makeRow("b", 3),
        ]);
        productMocks.batchGetProducts.mockResolvedValue([
            makeProduct({ id: "a", priceCents: 10 }),
            makeProduct({ id: "b", priceCents: 20 }),
        ]);

        const cart = await getCart(USER_ID);

        expect(cart.subtotalCents).toBe(90);
        expect(Number.isInteger(cart.subtotalCents)).toBe(true);
    });

    describe("missing / deleted products", () => {
        it("skips rows whose product no longer exists", async () => {
            cartMocks.listCartItems.mockResolvedValue([
                makeRow("a", 1),
                makeRow("ghost", 4),
            ]);
            productMocks.batchGetProducts.mockResolvedValue([
                makeProduct({ id: "a", priceCents: 500 }),
            ]);

            const cart = await getCart(USER_ID);

            expect(cart.lines).toHaveLength(1);
            expect(cart.lines[0].product.id).toBe("a");
        });

        it("excludes skipped rows from itemCount and subtotal", async () => {
            cartMocks.listCartItems.mockResolvedValue([
                makeRow("a", 2),
                makeRow("ghost", 99),
            ]);
            productMocks.batchGetProducts.mockResolvedValue([
                makeProduct({ id: "a", priceCents: 500 }),
            ]);

            const cart = await getCart(USER_ID);

            expect(cart.itemCount).toBe(2);
            expect(cart.subtotalCents).toBe(1000);
        });

        it("returns an empty cart when every product is gone", async () => {
            cartMocks.listCartItems.mockResolvedValue([
                makeRow("x", 1),
                makeRow("y", 1),
            ]);
            productMocks.batchGetProducts.mockResolvedValue([]);

            const cart = await getCart(USER_ID);

            expect(cart.lines).toEqual([]);
            expect(cart.itemCount).toBe(0);
            expect(cart.subtotalCents).toBe(0);
        });
    });

    describe("exceedsStock flag", () => {
        it.each([
            { quantity: 4, stock: 5, expected: false, label: "below stock" },
            {
                quantity: 5,
                stock: 5,
                expected: false,
                label: "exactly at stock",
            },
            { quantity: 6, stock: 5, expected: true, label: "one above stock" },
            {
                quantity: 1,
                stock: 0,
                expected: true,
                label: "product sold out",
            },
        ])(
            "is $expected when quantity is $label",
            async ({ quantity, stock, expected }) => {
                cartMocks.listCartItems.mockResolvedValue([
                    makeRow("p1", quantity),
                ]);
                productMocks.batchGetProducts.mockResolvedValue([
                    makeProduct({ id: "p1", stock }),
                ]);

                const cart = await getCart(USER_ID);

                expect(cart.lines[0].exceedsStock).toBe(expected);
            },
        );

        it("still counts over-stock lines in the totals (flag only, no clamping)", async () => {
            cartMocks.listCartItems.mockResolvedValue([makeRow("p1", 5)]);
            productMocks.batchGetProducts.mockResolvedValue([
                makeProduct({ id: "p1", stock: 2, priceCents: 100 }),
            ]);

            const cart = await getCart(USER_ID);

            expect(cart.lines[0].exceedsStock).toBe(true);
            expect(cart.itemCount).toBe(5);
            expect(cart.subtotalCents).toBe(500);
        });
    });

    describe("error propagation", () => {
        it("rejects when reading cart rows fails and never queries products", async () => {
            cartMocks.listCartItems.mockRejectedValue(new Error("db down"));

            await expect(getCart(USER_ID)).rejects.toThrow("db down");
            expect(productMocks.batchGetProducts).not.toHaveBeenCalled();
        });

        it("rejects when the product batch lookup fails", async () => {
            cartMocks.listCartItems.mockResolvedValue([makeRow("a", 1)]);
            productMocks.batchGetProducts.mockRejectedValue(
                new Error("products down"),
            );

            await expect(getCart(USER_ID)).rejects.toThrow("products down");
        });
    });
});

describe("getCartCount", () => {
    it("returns the sum computed by the repository for the given user", async () => {
        cartMocks.sumCartQuantities.mockResolvedValue(7);

        await expect(getCartCount(USER_ID)).resolves.toBe(7);
        expect(cartMocks.sumCartQuantities).toHaveBeenCalledTimes(1);
        expect(cartMocks.sumCartQuantities).toBeCalledWith(USER_ID);
    });

    it("returns 0 for an empty cart", async () => {
        cartMocks.sumCartQuantities.mockResolvedValue(0);

        await expect(getCartCount(USER_ID)).resolves.toBe(0);
    });

    it("is a cheap aggregate: it does not load rows or products", async () => {
        cartMocks.sumCartQuantities.mockResolvedValue(3);

        await getCartCount(USER_ID);

        expect(cartMocks.listCartItems).not.toHaveBeenCalled();
        expect(productMocks.batchGetProducts).not.toHaveBeenCalled();
    });

    it("propagates repository errors", async () => {
        cartMocks.sumCartQuantities.mockRejectedValue(new Error("boom"));

        await expect(getCartCount(USER_ID)).rejects.toThrow("boom");
    });
});

describe("addToCart", () => {
    describe("validation", () => {
        it("throws NotFoundError when the product does not exist", async () => {
            productMocks.getProduct.mockResolvedValue(null as never);

            const promise = addToCart(USER_ID, PRODUCT_ID, 1);

            await expect(promise).rejects.toBeInstanceOf(NotFoundError);
            await expect(promise).rejects.toThrow("Product not found");
            expect(cartMocks.incrementItem).not.toHaveBeenCalled();
        });

        it("throws ConflictError when the product is out of stock", async () => {
            productMocks.getProduct.mockResolvedValue(
                makeProduct({ stock: 0 }),
            );

            const promise = addToCart(USER_ID, PRODUCT_ID, 1);

            await expect(promise).rejects.toBeInstanceOf(ConflictError);
            await expect(promise).rejects.toThrow(
                "This product is out of stock",
            );
            expect(cartMocks.incrementItem).not.toHaveBeenCalled();
        });

        it("treats negative stock (data corruption) as out of stock", async () => {
            productMocks.getProduct.mockResolvedValue(
                makeProduct({ stock: -3 }),
            );

            await expect(
                addToCart(USER_ID, PRODUCT_ID, 1),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(cartMocks.incrementItem).not.toHaveBeenCalled();
        });

        it("looks the product up by the requested id", async () => {
            productMocks.getProduct.mockResolvedValue(makeProduct());
            cartMocks.incrementItem.mockResolvedValue(1);

            await addToCart(USER_ID, "p-42", 1);

            expect(productMocks.getProduct).toHaveBeenCalledTimes(1);
            expect(productMocks.getProduct).toBeCalledWith("p-42");
        });
    });

    describe("quantity cap = min(MAX_QTY_PER_ITEM, stock)", () => {
        it.each([
            { stock: 1, cap: 1, label: "stock is 1" },
            { stock: 3, cap: 3, label: "stock is below the max" },
            { stock: MAX_QTY, cap: MAX_QTY, label: "stock equals the max" },
            {
                stock: MAX_QTY + 1,
                cap: MAX_QTY,
                label: "stock is just above the max",
            },
            { stock: 500, cap: MAX_QTY, label: "stock is far above the max" },
        ])(
            "passes cap $cap to the repo when $label",
            async ({ stock, cap }) => {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock }),
                );
                cartMocks.incrementItem.mockResolvedValue(1);

                await addToCart(USER_ID, PRODUCT_ID, 1);

                expect(cartMocks.incrementItem).toHaveBeenCalledTimes(1);
                expect(cartMocks.incrementItem).toHaveBeenCalledWith(
                    USER_ID,
                    PRODUCT_ID,
                    1,
                    cap,
                );
            },
        );
    });

    describe("happy path", () => {
        it("delegates to the repository and returns the resulting quantity", async () => {
            productMocks.getProduct.mockResolvedValue(
                makeProduct({ stock: 50 }),
            );
            cartMocks.incrementItem.mockResolvedValue(4);

            const result = await addToCart(USER_ID, PRODUCT_ID, 2);

            expect(result).toBe(4);
            expect(cartMocks.incrementItem).toHaveBeenCalledWith(
                USER_ID,
                PRODUCT_ID,
                2,
                MAX_QTY,
            );
        });

        it("forwards the user id so one user's cart cannot be modified by another", async () => {
            productMocks.getProduct.mockResolvedValue(makeProduct());
            cartMocks.incrementItem.mockResolvedValue(1);

            await addToCart("user-B", PRODUCT_ID, 1);

            expect(cartMocks.incrementItem).toHaveBeenCalledWith(
                "user-B",
                expect.anything(),
                expect.anything(),
                expect.anything(),
            );
        });
    });

    describe("error propagation", () => {
        it("surfaces errors from the atomic cap check in the repository", async () => {
            productMocks.getProduct.mockResolvedValue(makeProduct());
            cartMocks.incrementItem.mockRejectedValue(
                new ConflictError("Cap reached"),
            );

            await expect(
                addToCart(USER_ID, PRODUCT_ID, 1),
            ).rejects.toBeInstanceOf(ConflictError);
        });

        it("surfaces errors from the product lookup", async () => {
            productMocks.getProduct.mockRejectedValue(
                new Error("lookup failed"),
            );

            await expect(addToCart(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(
                "lookup failed",
            );
            expect(cartMocks.incrementItem).not.toHaveBeenCalled();
        });
    });

    describe("quantity validation", () => {
        /** Arranges a valid product so only the quantity can fail validation. */
        function arrangeValidProduct() {
            productMocks.getProduct.mockResolvedValue(
                makeProduct({ stock: 50 }),
            );
            cartMocks.incrementItem.mockResolvedValue(1);
        }

        it("rejects a zero quantity (adding nothing is a caller bug, unlike updateQuantity where 0 means remove)", async () => {
            arrangeValidProduct();

            await expect(
                addToCart(USER_ID, PRODUCT_ID, 0),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(cartMocks.incrementItem).not.toHaveBeenCalled();
        });

        it.each([-1, -5, -100, Number.MIN_SAFE_INTEGER])(
            "rejects the negative quantity %s (would otherwise decrement the cart)",
            async (quantity) => {
                arrangeValidProduct();

                await expect(
                    addToCart(USER_ID, PRODUCT_ID, quantity),
                ).rejects.toBeInstanceOf(ConflictError);
                expect(cartMocks.incrementItem).not.toHaveBeenCalled();
            },
        );

        it.each([1.5, 0.1, 2.0000001, Number.NaN, Infinity, -Infinity])(
            "rejects the non-integer quantity %s",
            async (quantity) => {
                arrangeValidProduct();

                await expect(
                    addToCart(USER_ID, PRODUCT_ID, quantity),
                ).rejects.toBeInstanceOf(ConflictError);
                expect(cartMocks.incrementItem).not.toHaveBeenCalled();
            },
        );

        it("still accepts the smallest valid quantity (1)", async () => {
            arrangeValidProduct();

            await expect(addToCart(USER_ID, PRODUCT_ID, 1)).resolves.toBe(1);
            expect(cartMocks.incrementItem).toHaveBeenCalledTimes(1);
        });
    });

    describe("updateQuantity", () => {
        describe("removal (quantity === 0)", () => {
            it("removes the line without touching products or setQuantity", async () => {
                cartMocks.removeItem.mockResolvedValue(undefined);

                await updateQuantity(USER_ID, PRODUCT_ID, 0);

                expect(cartMocks.removeItem).toHaveBeenCalledTimes(1);
                expect(cartMocks.removeItem).toHaveBeenCalledWith(
                    USER_ID,
                    PRODUCT_ID,
                );
                expect(productMocks.getProduct).not.toHaveBeenCalled();
                expect(cartMocks.setQuantity).not.toHaveBeenCalled();
            });

            it("works even if the product has since been deleted (no product lookup)", async () => {
                // Users must always be able to clear dead lines from their cart.
                productMocks.getProduct.mockResolvedValue(null as never);
                cartMocks.removeItem.mockResolvedValue(undefined);

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, 0),
                ).resolves.toBeUndefined();
            });

            it("propagates repository errors", async () => {
                cartMocks.removeItem.mockRejectedValue(
                    new Error("delete failed"),
                );

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, 0),
                ).rejects.toThrow("delete failed");
            });
        });

        describe("validation", () => {
            it("throws NotFoundError when the product does not exist", async () => {
                productMocks.getProduct.mockResolvedValue(null as never);

                const promise = updateQuantity(USER_ID, PRODUCT_ID, 2);

                await expect(promise).rejects.toBeInstanceOf(NotFoundError);
                await expect(promise).rejects.toThrow("Product not found");
                expect(cartMocks.setQuantity).not.toHaveBeenCalled();
            });

            it("throws ConflictError when quantity exceeds MAX_QTY_PER_ITEM", async () => {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock: 100 }),
                );

                const promise = updateQuantity(
                    USER_ID,
                    PRODUCT_ID,
                    MAX_QTY + 1,
                );

                await expect(promise).rejects.toBeInstanceOf(ConflictError);
                await expect(promise).rejects.toThrow(
                    `Only ${MAX_QTY} available for this item`,
                );
                expect(cartMocks.setQuantity).not.toHaveBeenCalled();
            });

            it("throws ConflictError when quantity exceeds stock (stock < max)", async () => {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock: 3 }),
                );

                const promise = updateQuantity(USER_ID, PRODUCT_ID, 4);

                await expect(promise).rejects.toBeInstanceOf(ConflictError);
                await expect(promise).rejects.toThrow(
                    "Only 3 available for this item",
                );
                expect(cartMocks.setQuantity).not.toHaveBeenCalled();
            });

            it("reports 0 available when the product is sold out", async () => {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock: 0 }),
                );

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, 1),
                ).rejects.toThrow("Only 0 available for this item");
                expect(cartMocks.setQuantity).not.toHaveBeenCalled();
            });
        });

        describe("happy path", () => {
            it("sets the exact quantity when it is within the cap", async () => {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock: 100 }),
                );
                cartMocks.setQuantity.mockResolvedValue(undefined);

                await updateQuantity(USER_ID, PRODUCT_ID, 5);

                expect(cartMocks.setQuantity).toHaveBeenCalledTimes(1);
                expect(cartMocks.setQuantity).toHaveBeenCalledWith(
                    USER_ID,
                    PRODUCT_ID,
                    5,
                );
                expect(cartMocks.removeItem).not.toHaveBeenCalled();
            });

            it.each([
                {
                    stock: 100,
                    quantity: MAX_QTY,
                    label: "exactly MAX_QTY_PER_ITEM",
                },
                { stock: 4, quantity: 4, label: "exactly the available stock" },
                {
                    stock: 100,
                    quantity: 1,
                    label: "the minimum valid quantity",
                },
            ])("accepts a quantity of $label", async ({ stock, quantity }) => {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock }),
                );
                cartMocks.setQuantity.mockResolvedValue(undefined);

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, quantity),
                ).resolves.toBeUndefined();
                expect(cartMocks.setQuantity).toHaveBeenCalledWith(
                    USER_ID,
                    PRODUCT_ID,
                    quantity,
                );
            });
        });

        describe("error propagation", () => {
            it("surfaces errors thrown by setQuantity", async () => {
                productMocks.getProduct.mockResolvedValue(makeProduct());
                cartMocks.setQuantity.mockRejectedValue(
                    new Error("write failed"),
                );

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, 2),
                ).rejects.toThrow("write failed");
            });
        });

        describe("quantity validation", () => {
            /** Arranges a valid product so only the quantity can fail validation. */
            function arrangeValidProduct() {
                productMocks.getProduct.mockResolvedValue(
                    makeProduct({ stock: 50 }),
                );
                cartMocks.setQuantity.mockResolvedValue(undefined);
            }

            it.each([-1, -5, -100, Number.MIN_SAFE_INTEGER])(
                "rejects the negative quantity %s instead of passing it to the repository",
                async (quantity) => {
                    arrangeValidProduct();

                    await expect(
                        updateQuantity(USER_ID, PRODUCT_ID, quantity),
                    ).rejects.toBeInstanceOf(ConflictError);
                    expect(cartMocks.setQuantity).not.toHaveBeenCalled();
                    expect(cartMocks.removeItem).not.toHaveBeenCalled();
                },
            );

            it.each([1.5, 0.1, 2.0000001, Number.NaN, Infinity, -Infinity])(
                "rejects the non-integer quantity %s",
                async (quantity) => {
                    arrangeValidProduct();

                    await expect(
                        updateQuantity(USER_ID, PRODUCT_ID, quantity),
                    ).rejects.toBeInstanceOf(ConflictError);
                    expect(cartMocks.setQuantity).not.toHaveBeenCalled();
                    expect(cartMocks.removeItem).not.toHaveBeenCalled();
                },
            );

            it("does not treat zero as invalid: it is the removal sentinel", async () => {
                arrangeValidProduct();
                cartMocks.removeItem.mockResolvedValue(undefined);

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, 0),
                ).resolves.toBeUndefined();
                expect(cartMocks.removeItem).toHaveBeenCalledTimes(1);
                expect(cartMocks.removeItem).toHaveBeenCalledWith(
                    USER_ID,
                    PRODUCT_ID,
                );
            });

            it("still accepts the smallest valid quantity (1)", async () => {
                arrangeValidProduct();

                await expect(
                    updateQuantity(USER_ID, PRODUCT_ID, 1),
                ).resolves.toBeUndefined();
                expect(cartMocks.setQuantity).toHaveBeenCalledTimes(1);
                expect(cartMocks.setQuantity).toHaveBeenCalledWith(
                    USER_ID,
                    PRODUCT_ID,
                    1,
                );
            });
        });
    });

    describe("removeFromCart", () => {
        it("delegates to the repository with the user and product ids", async () => {
            cartMocks.removeItem.mockResolvedValue(undefined);

            await removeFromCart(USER_ID, PRODUCT_ID);

            expect(cartMocks.removeItem).toHaveBeenCalledTimes(1);
            expect(cartMocks.removeItem).toHaveBeenCalledWith(
                USER_ID,
                PRODUCT_ID,
            );
        });

        it("resolves to undefined", async () => {
            cartMocks.removeItem.mockResolvedValue(undefined);

            await expect(
                removeFromCart(USER_ID, PRODUCT_ID),
            ).resolves.toBeUndefined();
        });

        it("does not require the product to exist (no product lookup)", async () => {
            cartMocks.removeItem.mockResolvedValue(undefined);

            await removeFromCart(USER_ID, PRODUCT_ID);

            expect(productMocks.getProduct).not.toHaveBeenCalled();
        });

        it("propagates repository errors", async () => {
            cartMocks.removeItem.mockRejectedValue(new Error("delete failed"));

            await expect(removeFromCart(USER_ID, PRODUCT_ID)).rejects.toThrow(
                "delete failed",
            );
        });
    });
});
