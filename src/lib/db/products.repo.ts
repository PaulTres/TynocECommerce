import { API_LIMIT, PAGE_SIZE } from "@/lib/constants";
import { ValidationError } from "@/lib/errors";
import type { Page, Product, ProductQuery } from "@/types";
import { db } from "./client";

function decodeCursor(cursor?: string): string | undefined {
    if (!cursor) return undefined;
    try {
        const id: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (typeof id === "string" && id.length > 0) return id;
    } catch { /* return the validation error below */ }
    throw new ValidationError("Invalid pagination cursor");
}

function encodeCursor(id?: string): string | null {
    return id ? Buffer.from(JSON.stringify(id), "utf8").toString("base64url") : null;
}

function toProduct(row: { id: string; name: string; description: string; priceCents: number; currency: string; categorySlug: string; images: string[]; stock: number; tags: string[]; featured: boolean; createdAt: Date }): Product {
    return { ...row, currency: "USD", createdAt: row.createdAt.toISOString() };
}

export async function getProduct(id: string): Promise<Product | null> {
    const product = await db.product.findUnique({ where: { id } });
    return product ? toProduct(product) : null;
}

export async function batchGetProducts(ids: string[]): Promise<Product[]> {
    if (!ids.length) return [];
    const rows = await db.product.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return rows.map(toProduct);
}

export async function queryProducts(q: ProductQuery): Promise<Page<Product>> {
    const limit = q.limit ?? PAGE_SIZE;
    const afterId = decodeCursor(q.cursor);
    const where = {
        ...(q.categorySlug ? { categorySlug: q.categorySlug } : {}),
        ...(q.search ? { OR: [
            { name: { contains: q.search.trim(), mode: "insensitive" as const } },
            { description: { contains: q.search.trim(), mode: "insensitive" as const } },
            { tags: { has: q.search.trim().toLowerCase() } },
        ] } : {}),
        ...(q.minPriceCents !== undefined || q.maxPriceCents !== undefined ? { priceCents: { ...(q.minPriceCents !== undefined ? { gte: q.minPriceCents } : {}), ...(q.maxPriceCents !== undefined ? { lte: q.maxPriceCents } : {}) } } : {}),
    };
    const orderBy = q.sort === "price-asc" ? [{ priceCents: "asc" as const }, { id: "asc" as const }]
        : q.sort === "price-desc" ? [{ priceCents: "desc" as const }, { id: "asc" as const }]
        : [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const cursor = afterId ? await db.product.findUnique({ where: { id: afterId }, select: { id: true } }) : null;
    if (afterId && !cursor) throw new ValidationError("Invalid pagination cursor");
    const rows = await db.product.findMany({ where, orderBy, take: Math.min(limit, API_LIMIT) + 1, ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}) });
    const hasMore = rows.length > Math.min(limit, API_LIMIT);
    const items = rows.slice(0, Math.min(limit, API_LIMIT)).map(toProduct);
    return { items, nextCursor: hasMore ? encodeCursor(items.at(-1)?.id) : null };
}

export async function getRelated(product: Product, limit = 4): Promise<Product[]> {
    const rows = await db.product.findMany({ where: { categorySlug: product.categorySlug, id: { not: product.id } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.map(toProduct);
}

export async function putProduct(product: Product): Promise<void> {
    const data = { ...product, createdAt: new Date(product.createdAt) };
    await db.product.upsert({ where: { id: product.id }, create: data, update: data });
}
