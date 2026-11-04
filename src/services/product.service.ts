import * as categoriesRepo from "@/lib/db/categories.repo";
import * as productsRepo from "@/lib/db/products.repo";
import { NotFoundError } from "@/lib/errors";
import type { Category, Page, Product, ProductQuery } from "@/types";

/** Searches/filters the catalogue. */
export async function searchProducts(
    query: ProductQuery,
): Promise<Page<Product>> {
    return productsRepo.queryProducts(query);
}

/** Featured products for the homepage. Swap to GSI when product count grows. */
export async function getFeaturedProducts(limit = 4): Promise<Product[]> {
    const page = await productsRepo.queryProducts({ limit: 24 });
    return page.items.filter((p) => p.featured).slice(0, limit);
}

/** Newest products for the "new arrivals" shelf. */
export async function getNewArrivals(limit = 4): Promise<Product[]> {
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
