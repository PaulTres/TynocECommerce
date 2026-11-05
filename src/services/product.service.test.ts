import { beforeEach, describe, expect, it, vi } from "vitest";

import * as categoriesRepo from "@/lib/db/categories.repo";
import * as productsRepo from "@/lib/db/products.repo";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Category, Page, Product } from "@/types";

import {
    getCategories,
    getFeaturedProducts,
    getNewArrivals,
    getProductDetail,
    searchProducts,
} from "./product.service";

/*Module mocks*/
vi.mock("@/lib/db/products.repo", () => ({
    queryProducts: vi.fn(),
    getProduct: vi.fn(),
    getRelated: vi.fn(),
}));

vi.mock("@/lib/db/categories.repo", () => ({
    listCategories: vi.fn(),
    getCategory: vi.fn(),
}));

const queryProducts = vi.mocked(productsRepo.queryProducts);
const getProduct = vi.mocked(productsRepo.getProduct);
const getRelated = vi.mocked(productsRepo.getRelated);
const listCategories = vi.mocked(categoriesRepo.listCategories);
const getCategory = vi.mocked(categoriesRepo.getCategory);

/** Builds a minimal Product fixture; override any field per test. */
function makeProduct(overrides: Partial<Product> = {}): Product {
    return {
        id: "p-1",
        name: "Test product",
        categorySlug: "shoes",
        ...overrides,
    } as unknown as Product;
}

/** Builds a minimal Category fixture; override any field per test. */
function makeCategory(overrides: Partial<Category> = {}): Category {
    return {
        slug: "shoes",
        name: "Shoes",
        ...overrides,
    } as unknown as Category;
}

/** Wraps items in the Page shape returned by `queryProducts`. */
function makePage(items: Product[]): Page<Product> {
    return { items } as unknown as Page<Product>;
}

/**
 * Creates a promise whose resolution is controlled by the test. Used to prove
 * that two async calls are started concurrently rather than sequentially.
 */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/*
 * Inputs the limit guard must reject. Shared by getFeaturedProducts and
 * getNewArrivals..
 */
const INVALID_LIMITS: Array<[string, number]> = [
    ["negative integer", -1],
    ["large negative integer", -9999],
    ["negative fraction", -0.5],
    ["positive fraction", 4.5],
    ["NaN", Number.NaN],
    ["positive Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
];

beforeEach(() => {
    // Safe defaults; individual tests override what they care about.
    queryProducts.mockResolvedValue(makePage([]));
    getProduct.mockResolvedValue(null as unknown as Product);
    getRelated.mockResolvedValue([]);
    listCategories.mockResolvedValue([]);
    getCategory.mockResolvedValue(null as unknown as Category);
});

describe("searchProducts", () => {
    it("delegates to the repository with the exact query object", async () => {
        const query = { limit: 10 } as unknown as Parameters<
            typeof searchProducts
        >[0];

        await searchProducts(query);

        expect(queryProducts).toHaveBeenCalledTimes(1);
        //the service must not clone or mutate the query.
        expect(queryProducts.mock.calls[0][0]).toBe(query);
    });

    it("returns the repository page untouched", async () => {
        const page = makePage([
            makeProduct({ id: "a" }),
            makeProduct({ id: "b" }),
        ]);
        queryProducts.mockResolvedValue(page);

        const result = await searchProducts({} as never);

        expect(result).toBe(page);
    });

    it("returns an empty page when nothing matches", async () => {
        const result = await searchProducts({} as never);

        expect(result.items).toEqual([]);
    });

    it("propagates repository failures instead of swallowing them", async () => {
        const boom = new Error("db down");
        queryProducts.mockRejectedValue(boom);

        await expect(searchProducts({} as never)).rejects.toBe(boom);
    });
});

describe("getFeaturedProducts", () => {
    it("unwraps and returns only the `items` array from the page", async () => {
        const items = [makeProduct({ id: "a" }), makeProduct({ id: "b" })];
        queryProducts.mockResolvedValue(makePage(items));

        const result = await getFeaturedProducts();

        expect(result).toBe(items);
    });

    it.each(INVALID_LIMITS)(
        "rejects an invalid limit (%s) with ConflictError and never hits the DB",
        async (_label, limit) => {
            await expect(getFeaturedProducts(limit)).rejects.toBeInstanceOf(
                ConflictError,
            );
            expect(queryProducts).not.toHaveBeenCalled();
        },
    );

    it("includes the offending value in the error message", async () => {
        await expect(getFeaturedProducts(-3)).rejects.toThrow(
            "Invalid limit -3!",
        );
    });

    it("surfaces validation problems as a rejected promise, not a sync throw", async () => {
        let result: Promise<Product[]> | undefined;
        expect(() => {
            result = getFeaturedProducts(-1);
        }).not.toThrow();
        await expect(result).rejects.toBeInstanceOf(ConflictError);
    });

    it("propagates repository failures", async () => {
        const boom = new Error("db down");
        queryProducts.mockRejectedValue(boom);

        await expect(getFeaturedProducts()).rejects.toBe(boom);
    });
});

describe("getNewArrivals", () => {
    it("does not restrict to featured products", async () => {
        await getNewArrivals();

        expect(queryProducts.mock.calls[0][0]).not.toHaveProperty("featured");
    });

    it("returns only the `items` array from the page", async () => {
        const items = [makeProduct({ id: "new-1" })];
        queryProducts.mockResolvedValue(makePage(items));

        await expect(getNewArrivals()).resolves.toBe(items);
    });

    it.each(INVALID_LIMITS)(
        "rejects an invalid limit (%s) with ConflictError and never hits the DB",
        async (_label, limit) => {
            await expect(getNewArrivals(limit)).rejects.toBeInstanceOf(
                ConflictError,
            );
            expect(queryProducts).not.toHaveBeenCalled();
        },
    );

    it("includes the offending value in the error message", async () => {
        await expect(getNewArrivals(2.5)).rejects.toThrow("Invalid limit 2.5!");
    });

    it("propagates repository failures", async () => {
        const boom = new Error("db down");
        queryProducts.mockRejectedValue(boom);

        await expect(getNewArrivals()).rejects.toBe(boom);
    });
});

describe("getCategories", () => {
    it("returns the categories supplied by the repository", async () => {
        const categories = [
            makeCategory({ slug: "shoes" }),
            makeCategory({ slug: "hats" }),
        ];
        listCategories.mockResolvedValue(categories);

        const result = await getCategories();

        expect(listCategories).toHaveBeenCalledTimes(1);
        expect(result).toBe(categories);
    });

    it("returns an empty array when there are no categories", async () => {
        await expect(getCategories()).resolves.toEqual([]);
    });

    it("propagates repository failures", async () => {
        const boom = new Error("db down");
        listCategories.mockRejectedValue(boom);

        await expect(getCategories()).rejects.toBe(boom);
    });
});

describe("getProductDetail", () => {
    describe("when the product exists", () => {
        it("returns the product together with its category and related products", async () => {
            const product = makeProduct({ id: "p-1", categorySlug: "shoes" });
            const category = makeCategory({ slug: "shoes" });
            const related = [
                makeProduct({ id: "p-2" }),
                makeProduct({ id: "p-3" }),
            ];
            getProduct.mockResolvedValue(product);
            getCategory.mockResolvedValue(category);
            getRelated.mockResolvedValue(related);

            const result = await getProductDetail("p-1");

            expect(result).toEqual({ product, category, related });
        });

        it("looks the product up by the id it was given", async () => {
            getProduct.mockResolvedValue(makeProduct());

            await getProductDetail("abc-123");

            expect(getProduct).toHaveBeenCalledTimes(1);
            expect(getProduct).toHaveBeenCalledWith("abc-123");
        });

        it("fetches the category using the product's categorySlug", async () => {
            getProduct.mockResolvedValue(makeProduct({ categorySlug: "hats" }));

            await getProductDetail("p-1");

            expect(getCategory).toHaveBeenCalledWith("hats");
        });

        it("requests exactly 4 related products, passing the full product object", async () => {
            const product = makeProduct();
            getProduct.mockResolvedValue(product);

            await getProductDetail("p-1");

            expect(getRelated).toHaveBeenCalledWith(product, 4);
        });

        it("starts the category and related lookups concurrently", async () => {
            const product = makeProduct();
            const category = makeCategory();
            const related = [makeProduct({ id: "r" })];
            const categoryGate = deferred<Category>();
            const relatedGate = deferred<Product[]>();
            getProduct.mockResolvedValue(product);
            getCategory.mockReturnValue(categoryGate.promise);
            getRelated.mockReturnValue(relatedGate.promise);

            const pending = getProductDetail("p-1");

            await vi.waitFor(() => {
                expect(getCategory).toHaveBeenCalledTimes(1);
                expect(getRelated).toHaveBeenCalledTimes(1);
            });

            categoryGate.resolve(category);
            relatedGate.resolve(related);

            await expect(pending).resolves.toEqual({
                product,
                category,
                related,
            });
        });

        it("passes through a null category when the category row is missing", async () => {
            getProduct.mockResolvedValue(makeProduct());
            getCategory.mockResolvedValue(null as unknown as Category);

            const result = await getProductDetail("p-1");

            expect(result.category).toBeNull();
        });

        it("returns an empty related list when there are no related products", async () => {
            getProduct.mockResolvedValue(makeProduct());
            getRelated.mockResolvedValue([]);

            const result = await getProductDetail("p-1");

            expect(result.related).toEqual([]);
        });
    });

    describe("when the product does not exist", () => {
        it("throws NotFoundError when the repository returns null", async () => {
            getProduct.mockResolvedValue(null as unknown as Product);

            await expect(getProductDetail("missing")).rejects.toBeInstanceOf(
                NotFoundError,
            );
        });

        it("throws NotFoundError when the repository returns undefined", async () => {
            getProduct.mockResolvedValue(undefined as unknown as Product);

            await expect(getProductDetail("missing")).rejects.toBeInstanceOf(
                NotFoundError,
            );
        });

        it("includes the requested id in the error message", async () => {
            await expect(getProductDetail("ghost-42")).rejects.toThrow(
                "Product with id ghost-42 not found",
            );
        });

        it("does not query categories or related products", async () => {
            await expect(getProductDetail("missing")).rejects.toThrow();

            expect(getCategory).not.toHaveBeenCalled();
            expect(getRelated).not.toHaveBeenCalled();
        });
    });

    describe("error propagation", () => {
        it("propagates a failure from getProduct without wrapping it", async () => {
            const boom = new Error("db down");
            getProduct.mockRejectedValue(boom);

            await expect(getProductDetail("p-1")).rejects.toBe(boom);
            expect(getCategory).not.toHaveBeenCalled();
            expect(getRelated).not.toHaveBeenCalled();
        });

        it("rejects the whole call when getCategory fails", async () => {
            const boom = new Error("category lookup failed");
            getProduct.mockResolvedValue(makeProduct());
            getCategory.mockRejectedValue(boom);

            await expect(getProductDetail("p-1")).rejects.toBe(boom);
        });

        it("rejects the whole call when getRelated fails", async () => {
            const boom = new Error("related lookup failed");
            getProduct.mockResolvedValue(makeProduct());
            getRelated.mockRejectedValue(boom);

            await expect(getProductDetail("p-1")).rejects.toBe(boom);
        });
    });
});
