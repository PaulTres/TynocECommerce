import type { Category } from "@/types";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getEnv } from "../env";
import { getDb, getTableName } from "./client";
import { ALL_CATEGORIES_PK, keys, stripKeys } from "./keys";

/** Lists every category ordered by name. Categories are few, so one Query on GSI2 suffices. */
export async function listCategories(): Promise<Category[]> {
    const res = await getDb().send(
        new QueryCommand({
            TableName: getTableName(),
            IndexName: getEnv().GSI2,
            KeyConditionExpression: "GSI2PK = :pk",
            ExpressionAttributeValues: { ":pk": ALL_CATEGORIES_PK },
        }),
    );
    return (res.Items ?? []).map((i) => stripKeys<Category>(i));
}

/** Fetches one category by slug, or null when it does not exist. */
export async function getCategory(slug: string): Promise<Category | null> {
    const res = await getDb().send(
        new GetCommand({ TableName: getTableName(), Key: keys.category(slug) }),
    );
    return res.Item ? stripKeys<Category>(res.Item) : null;
}

/** Creates or overwrites a category. Currently only used in seeding. GSI2SK = name gives alphabetical listing. */
export async function putCategory(category: Category): Promise<void> {
    await getDb().send(
        new PutCommand({
            TableName: getTableName(),
            Item: {
                ...keys.category(category.slug),
                entityType: "CATEGORY",
                GSI2PK: ALL_CATEGORIES_PK,
                GSI2SK: category.name,
                ...category,
            },
        }),
    );
}
