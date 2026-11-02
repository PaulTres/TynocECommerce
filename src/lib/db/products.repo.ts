import { API_LIMIT, MAX_QUERY_ROUNDS, PAGE_SIZE } from "@/lib/constants";
import type { Page, Product, ProductQuery } from "@/types";
import {
    BatchGetCommand,
    type BatchGetCommandOutput,
    GetCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getEnv } from "../env";
import { getDb, getTableName } from "./client";
import { chunk, decodeCursor, encodeCursor } from "./helpers";
import { ALL_PRODUCTS_PK, categoryProductsPk, keys, stripKeys } from "./keys";

/**
 * Converts a Product into a DynamoDB item with key and index attributes.
 * - GSI1 groups products by category (newest first via the timestamp-prefixed sort key).
 * - GSI2 lists all products newest first.
 * - `searchText` is a lower-cased blob used by the naive contains() search.
 */
function toItem(p: Product): Record<string, unknown> {
    const sortKey = `${p.createdAt}#${p.id}`;
    return {
        ...keys.product(p.id),
        entityType: "PRODUCT",
        GSI1PK: categoryProductsPk(p.categorySlug),
        GSI1SK: sortKey,
        GSI2PK: ALL_PRODUCTS_PK,
        GSI2SK: sortKey,
        searchText:
            `${p.name} ${p.description} ${p.tags.join(" ")}`.toLowerCase(),
        ...p,
    };
}

/** Fetches a single product by id (O(1) key lookup) or null. */
export async function getProduct(id: string): Promise<Product | null> {
    const res = await getDb().send(
        new GetCommand({ TableName: getTableName(), Key: keys.product(id) }),
    );
    return res.Item ? stripKeys<Product>(res.Item) : null;
}

/**
 * Fetches many products in as few requests as possible.
 * Use BatchGet in chunks of 100 (the API limit); unprocessed keys are retried with a small backoff.
 * Missing ids are simply absent from the result - callers decide how to handle them.
 */
export async function batchGetProducts(ids: string[]): Promise<Product[]> {
    const unique = [...new Set(ids)];
    const TableName = getTableName();
    const found: Product[] = [];

    for (const group of chunk(unique, API_LIMIT)) {
        let pending: Record<string, unknown>[] | undefined = group.map((id) =>
            keys.product(id),
        );
        for (
            let attempt = 0;
            pending && pending.length > 0 && attempt < MAX_QUERY_ROUNDS - 1;
            attempt++
        ) {
            if (attempt > 0)
                await new Promise((r) => setTimeout(r, API_LIMIT ** attempt)); // exponential backoff
            const res: BatchGetCommandOutput = await getDb().send(
                new BatchGetCommand({
                    RequestItems: {
                        [TableName]: {
                            Keys: pending as Record<string, string>[],
                        },
                    },
                }),
            );
            for (const item of res.Responses?.[TableName] ?? [])
                found.push(stripKeys<Product>(item));
            pending = res.UnprocessedKeys?.[TableName]?.Keys;
        }
    }
    return found;
}

/**
 * Lists products with optional category, text and price filters.
 * Picks the cheapest index for the request (GSI1 when a category is given, else GSI2),
 * then applies search/price as a FilterExpression. Because filters run after the read,
 * a single DynamoDB page may contain fewer matches than requested, so we loop (bounded) until
 * the page is full. The cursor always points at the last item actually returned.
 * Limitations: contains() search scans the partition - OpenSearch/Algolia may be needed for larger tables; price sorting is applied per page only.
 */
export async function queryProducts(q: ProductQuery): Promise<Page<Product>> {
    const limit = q.limit ?? PAGE_SIZE;
    const useCategory = Boolean(q.categorySlug);
    const indexName = useCategory ? getEnv().GSI1 : getEnv().GSI2;
    const pkAttr = useCategory ? `${indexName}PK` : `${indexName}PK`;
    const skAttr = useCategory ? `${indexName}SK` : `${indexName}SK`;

    const filters: string[] = [];
    const values: Record<string, unknown> = {
        ":pk": useCategory
            ? categoryProductsPk(q.categorySlug as string)
            : ALL_PRODUCTS_PK,
    };
    if (q.search) {
        filters.push("contains(searchText, :search)");
        values[":search"] = q.search.toLowerCase().trim();
    }
    if (q.minPriceCents !== undefined) {
        filters.push("priceCents >= :min");
        values[":min"] = q.minPriceCents;
    }
    if (q.maxPriceCents !== undefined) {
        filters.push("priceCents <= :max");
        values[":max"] = q.maxPriceCents;
    }

    const collected: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined = decodeCursor(q.cursor);

    for (let round = 0; round < MAX_QUERY_ROUNDS; round++) {
        const res = await getDb().send(
            new QueryCommand({
                TableName: getTableName(),
                IndexName: indexName,
                KeyConditionExpression: `${pkAttr} = :pk`,
                FilterExpression: filters.length
                    ? filters.join(" AND ")
                    : undefined,
                ExpressionAttributeValues: values,
                ExclusiveStartKey: lastKey,
                ScanIndexForward: false, // newest first
                Limit: API_LIMIT / 2, // items *evaluated* per round (filters apply afterwards)
            }),
        );
        collected.push(...(res.Items ?? []));
        lastKey = res.LastEvaluatedKey;
        if (!lastKey || collected.length >= limit) break;
    }

    // If we over-collected, trim and rewind the cursor to the last item we actually return.
    let nextKey = lastKey;
    if (collected.length > limit) {
        collected.length = limit;
        const last = collected[limit - 1] as Record<string, unknown>;
        nextKey = {
            PK: last.PK,
            SK: last.SK,
            [pkAttr]: last[pkAttr],
            [skAttr]: last[skAttr],
        };
    }

    let items = collected.map((i) => stripKeys<Product>(i));
    if (q.sort === "price-asc")
        items = items.sort((a, b) => a.priceCents - b.priceCents);
    if (q.sort === "price-desc")
        items = items.sort((a, b) => b.priceCents - a.priceCents);

    return { items, nextCursor: encodeCursor(nextKey) };
}

/**
 * Returns up to `limit` other products from the same category.
 * queries GSI1 for the category (newest first) and drops the current product.
 */
export async function getRelated(
    product: Product,
    limit = 4,
): Promise<Product[]> {
    const res = await getDb().send(
        new QueryCommand({
            TableName: getTableName(),
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: {
                ":pk": categoryProductsPk(product.categorySlug),
            },
            ScanIndexForward: false,
            Limit: limit + 1, // +1 because the product itself may be in the result
        }),
    );
    return (res.Items ?? [])
        .map((i) => stripKeys<Product>(i))
        .filter((p) => p.id !== product.id)
        .slice(0, limit);
}

/** Creates or replaces a product (admin/seed use). */
export async function putProduct(product: Product): Promise<void> {
    await getDb().send(
        new PutCommand({ TableName: getTableName(), Item: toItem(product) }),
    );
}
