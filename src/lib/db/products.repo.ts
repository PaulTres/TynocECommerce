import { API_LIMIT, PAGE_SIZE } from "@/lib/constants";
import { ValidationError } from "@/lib/errors";
import type { Page, Product, ProductQuery } from "@/types";
import { dataApi } from "./data-api";

type ProductRow = {
    id: unknown;
    name: unknown;
    description: unknown;
    priceCents: unknown;
    currency: unknown;
    categorySlug: unknown;
    images: unknown;
    stock: unknown;
    tags: unknown;
    featured: unknown;
    createdAt: unknown;
};

type ProductCursorRow = {
    id: string;
    priceCents: number;
    createdAt: string;
};

function decodeCursor(cursor?: string): string | undefined {
    if (!cursor) return undefined;
    try {
        const id: unknown = JSON.parse(
            Buffer.from(cursor, "base64url").toString("utf8"),
        );
        if (typeof id === "string" && id.length > 0) return id;
    } catch {
        // Return the validation error below.
    }
    throw new ValidationError("Invalid pagination cursor");
}

function encodeCursor(id?: string): string | null {
    return id
        ? Buffer.from(JSON.stringify(id), "utf8").toString("base64url")
        : null;
}

function toIso(value: unknown): string {
    return value instanceof Date
        ? value.toISOString()
        : new Date(String(value)).toISOString();
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
}

function toProduct(row: ProductRow): Product {
    return {
        id: String(row.id),
        name: String(row.name),
        description: String(row.description),
        priceCents: Number(row.priceCents),
        currency: String(row.currency),
        categorySlug: String(row.categorySlug),
        images: toStringArray(row.images),
        stock: Number(row.stock),
        tags: toStringArray(row.tags),
        featured: Boolean(row.featured),
        createdAt: toIso(row.createdAt),
    };
}

const PRODUCT_COLUMNS =
    "id,name,description,priceCents,currency,categorySlug,images,stock,tags,featured,createdAt";

function quoteFilterValue(value: string): string {
    return JSON.stringify(value);
}

function escapeLike(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
}

export async function getProduct(id: string): Promise<Product | null> {
    const query = new URLSearchParams({
        select: PRODUCT_COLUMNS,
        id: `eq.${id}`,
        limit: "1",
    });
    const rows = await dataApi<ProductRow[]>("Product", {
        access: "anonymous",
        query,
    });
    return rows[0] ? toProduct(rows[0]) : null;
}

export async function batchGetProducts(ids: string[]): Promise<Product[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];

    const query = new URLSearchParams({
        select: PRODUCT_COLUMNS,
        id: "in.(" + uniqueIds.join(",") + ")",
    });
    const rows = await dataApi<ProductRow[]>("Product", {
        access: "anonymous",
        query,
    });
    return rows.map(toProduct);
}

export async function queryProducts(q: ProductQuery): Promise<Page<Product>> {
    const limit = Math.max(1, Math.min(q.limit ?? PAGE_SIZE, API_LIMIT));
    const sort = q.sort ?? "newest";
    const afterId = decodeCursor(q.cursor);
    const query = new URLSearchParams({
        select: PRODUCT_COLUMNS,
        limit: String(limit + 1),
    });
    const logicGroups: string[] = [];

    if (q.categorySlug) query.set("categorySlug", `eq.${q.categorySlug}`);
    if (q.minPriceCents !== undefined)
        query.set("priceCents", "gte." + String(q.minPriceCents));
    if (q.maxPriceCents !== undefined) {
        // PostgREST accepts repeated filters for one column as an implicit AND.
        query.append("priceCents", "lte." + String(q.maxPriceCents));
    }
    if (q.search?.trim()) {
        const search = q.search.trim();
        const pattern = quoteFilterValue("%" + escapeLike(search) + "%");
        const tag = quoteFilterValue(search.toLowerCase());
        logicGroups.push(
            "or(name.ilike." +
                pattern +
                ",description.ilike." +
                pattern +
                ",tags.cs.{" +
                tag +
                "})",
        );
    }

    let cursorRow: ProductCursorRow | null = null;
    if (afterId) {
        const cursorQuery = new URLSearchParams({
            select: "id,priceCents,createdAt",
            id: `eq.${afterId}`,
            limit: "1",
        });
        const cursorRows = await dataApi<ProductCursorRow[]>("Product", {
            access: "anonymous",
            query: cursorQuery,
        });
        cursorRow = cursorRows[0] ?? null;
        if (!cursorRow) throw new ValidationError("Invalid pagination cursor");
    }

    if (cursorRow) {
        const cursorId = quoteFilterValue(cursorRow.id);
        if (sort === "price-asc") {
            logicGroups.push(
                "or(priceCents.gt." +
                    cursorRow.priceCents +
                    ",and(priceCents.eq." +
                    cursorRow.priceCents +
                    ",id.gt." +
                    cursorId +
                    "))",
            );
        } else if (sort === "price-desc") {
            logicGroups.push(
                "or(priceCents.lt." +
                    cursorRow.priceCents +
                    ",and(priceCents.eq." +
                    cursorRow.priceCents +
                    ",id.gt." +
                    cursorId +
                    "))",
            );
        } else {
            const createdAt = quoteFilterValue(cursorRow.createdAt);
            logicGroups.push(
                "or(createdAt.lt." +
                    createdAt +
                    ",and(createdAt.eq." +
                    createdAt +
                    ",id.lt." +
                    cursorId +
                    "))",
            );
        }
    }

    if (logicGroups.length === 1) query.set("or", logicGroups[0].slice(2));
    else if (logicGroups.length > 1)
        query.set("and", "(" + logicGroups.join(",") + ")");

    const order =
        sort === "price-asc"
            ? "priceCents.asc,id.asc"
            : sort === "price-desc"
              ? "priceCents.desc,id.asc"
              : "createdAt.desc,id.desc";
    query.set("order", order);

    const rows = await dataApi<ProductRow[]>("Product", {
        access: "anonymous",
        query,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toProduct);
    return {
        items,
        nextCursor: hasMore ? encodeCursor(items.at(-1)?.id) : null,
    };
}

export async function getRelated(
    product: Product,
    limit = 4,
): Promise<Product[]> {
    const query = new URLSearchParams({
        select: PRODUCT_COLUMNS,
        categorySlug: `eq.${product.categorySlug}`,
        id: `neq.${product.id}`,
        order: "createdAt.desc,id.desc",
        limit: String(Math.max(0, Math.trunc(limit))),
    });
    const rows = await dataApi<ProductRow[]>("Product", {
        access: "anonymous",
        query,
    });
    return rows.map(toProduct);
}
