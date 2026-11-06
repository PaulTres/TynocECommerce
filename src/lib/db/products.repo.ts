import { API_LIMIT, PAGE_SIZE } from "@/lib/constants";
import { ValidationError } from "@/lib/errors";
import type {
    Page,
    Product,
    ProductCursorRow,
    ProductQuery,
    ProductRow,
} from "@/types";
import {
    asIso,
    decodeCursor,
    encodeCursor,
    isNaturalNumber,
    toStringArray,
} from "../utils";
import { dataApi } from "./data-api";

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
        createdAt: asIso(row.createdAt),
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
    //prevents ambiguous pagination requests
    if (q.nextCursor && q.prevCursor) {
        throw new ValidationError("Cannot use both pagination cursors");
    }

    const limit = Math.max(1, Math.min(q.limit ?? PAGE_SIZE, API_LIMIT));
    const sort = q.sort ?? "newest";
    const isPrevious = Boolean(q.prevCursor);
    const cursorId = decodeCursor(q.prevCursor ?? q.nextCursor);

    const query = new URLSearchParams({
        select: PRODUCT_COLUMNS,
        limit: String(limit + 1),
    });

    const logicGroups: string[] = [];

    // Apply the regular product filters.
    if (q.featured) query.set("featured", `eq.${q.featured}`);
    if (q.categorySlug) query.set("categorySlug", `eq.${q.categorySlug}`);

    if (q.minPriceCents !== undefined) {
        query.set("priceCents", "gte." + String(q.minPriceCents));
    }

    if (q.maxPriceCents !== undefined) {
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

    // Retrieve the sorting values of the cursor product.
    let cursorRow: ProductCursorRow | null = null;

    if (cursorId) {
        const cursorQuery = new URLSearchParams({
            select: "id,priceCents,createdAt",
            id: `eq.${cursorId}`,
            limit: "1",
        });

        const cursorRows = await dataApi<ProductCursorRow[]>("Product", {
            access: "anonymous",
            query: cursorQuery,
        });

        cursorRow = cursorRows[0] ?? null;

        if (!cursorRow) {
            throw new ValidationError("Invalid pagination cursor");
        }
    }

    // Apply the appropriate keyset condition for the requested direction.
    if (cursorRow) {
        const id = quoteFilterValue(cursorRow.id);

        if (sort === "price-asc" || sort === "price-desc") {
            const isAscending = sort === "price-asc";

            // Forward follows the selected sort order.
            // Backward uses the inverse comparison.
            const priceOperator = isAscending
                ? isPrevious
                    ? "lt"
                    : "gt"
                : isPrevious
                  ? "gt"
                  : "lt";

            const idOperator = isPrevious ? "lt" : "gt";

            logicGroups.push(
                "or(priceCents." +
                    priceOperator +
                    "." +
                    cursorRow.priceCents +
                    ",and(priceCents.eq." +
                    cursorRow.priceCents +
                    ",id." +
                    idOperator +
                    "." +
                    id +
                    "))",
            );
        } else {
            const createdAt = quoteFilterValue(cursorRow.createdAt);

            logicGroups.push(
                "or(createdAt." +
                    (isPrevious ? "gt." : "lt.") +
                    createdAt +
                    ",and(createdAt.eq." +
                    createdAt +
                    ",id." +
                    (isPrevious ? "gt." : "lt.") +
                    id +
                    "))",
            );
        }
    }

    // Combine search and pagination conditions.
    if (logicGroups.length === 1) {
        query.set("or", logicGroups[0].slice(2));
    } else if (logicGroups.length > 1) {
        query.set("and", "(" + logicGroups.join(",") + ")");
    }

    // Reverse the database ordering when fetching a previous page.
    const order =
        sort === "price-asc"
            ? isPrevious
                ? "priceCents.desc,id.desc"
                : "priceCents.asc,id.asc"
            : sort === "price-desc"
              ? isPrevious
                  ? "priceCents.asc,id.desc"
                  : "priceCents.desc,id.asc"
              : isPrevious
                ? "createdAt.asc,id.asc"
                : "createdAt.desc,id.desc";

    query.set("order", order);

    // Fetch one extra record to determine whether another page exists.
    const rows = await dataApi<ProductRow[]>("Product", {
        access: "anonymous",
        query,
    });

    const hasMore = rows.length > limit;

    // Keep the closest records to the cursor and restore display ordering.
    const pageRows = isPrevious
        ? rows.slice(0, limit).reverse()
        : rows.slice(0, limit);

    const items = pageRows.map(toProduct);

    // Generate navigation cursors from the first and last displayed products.
    const firstId = items[0]?.id;
    const lastId = items.at(-1)?.id;

    return {
        items,
        // Forward navigation exists if more records were found after this page.
        nextCursor:
            lastId !== undefined && (isPrevious || hasMore)
                ? encodeCursor(lastId)
                : undefined,
        // Backward navigation exists if more records were found before this page.
        prevCursor:
            firstId !== undefined &&
            (!isPrevious && cursorId ? true : isPrevious && hasMore)
                ? encodeCursor(firstId)
                : undefined,
    };
}

export async function getRelated(
    product: Product,
    limit = 4,
): Promise<Product[]> {
    if (limit <= 0 || !isNaturalNumber(limit))
        throw new ValidationError(`Invalid limit ${limit}!`);
    const query = new URLSearchParams({
        select: PRODUCT_COLUMNS,
        categorySlug: `eq.${product.categorySlug}`,
        id: `neq.${product.id}`,
        order: "createdAt.desc,id.desc",
        limit: String(limit),
    });
    const rows = await dataApi<ProductRow[]>("Product", {
        access: "anonymous",
        query,
    });
    return rows.map(toProduct);
}
