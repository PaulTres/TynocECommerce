import * as categoriesRepo from "@/lib/db/categories.repo";
import * as productsRepo from "@/lib/db/products.repo";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertValidPriceRange, isNaturalNumber } from "@/lib/utils";
import type { Category, Page, Product, ProductQuery } from "@/types";

/** Searches/filters the catalogue. */
export async function searchProducts(
    query: ProductQuery,
): Promise<Page<Product>> {
    // Enforce the price range for every caller before the repository builds a query.
    assertValidPriceRange(query.minPriceCents, query.maxPriceCents);
    return productsRepo.queryProducts(query);
}

/** Featured products for the homepage. */
export async function getFeaturedProducts(
    limit: number = 4,
): Promise<Product[]> {
    if (!isNaturalNumber(limit))
        throw new ValidationError(`Invalid limit ${limit}!`);
    return (
        await productsRepo.queryProducts({
            limit: limit,
            featured: true,
        })
    ).items;
}

/** Newest products for the "new arrivals" shelf. */
export async function getNewArrivals(limit: number = 4): Promise<Product[]> {
    if (!isNaturalNumber(limit))
        throw new ValidationError(`Invalid limit ${limit}!`);
    return (await productsRepo.queryProducts({ limit })).items;
}

/** All categories for navigation and the homepage tiles. */
export async function getCategories(): Promise<Category[]> {
    return categoriesRepo.listCategories();
}

/**
 * Loads a product plus its category and related products in parallel.
 * @throws NotFoundError when the id is unknown.
 */
export async function getProductDetail(id: string) {
    const product = await productsRepo.getProduct(id);
    if (!product) {
        //console.log(`Product with id ${id} not found`);
        throw new NotFoundError(`Product with id ${id} not found`);
    }
    const [category, related] = await Promise.all([
        categoriesRepo.getCategory(product.categorySlug),
        productsRepo.getRelated(product, 4),
    ]);
    return { product, category, related };
}
