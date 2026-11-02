import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getDb, getTableName } from "./client";
import { WISH_PREFIX, keys, stripKeys } from "./keys";
import { isConditionalFailure } from "./helpers";
import type { WishlistItemRecord } from "@/types";

/** Lists a user's wishlist rows, newest first (reads the user's partition, SK begins_with WISH#). */
export async function listWishlist(userId: string): Promise<WishlistItemRecord[]> {
  const res = await getDb().send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": WISH_PREFIX },
    }),
  );
  return (res.Items ?? [])
    .map((i) => stripKeys<WishlistItemRecord>(i))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/**
 * Adds a product to the wishlist without ever creating duplicates.
 * The item key (USER#id / WISH#productId) is deterministic, so a second add targets the
 * same key; `attribute_not_exists(PK)` turns it into a no-op instead of overwriting addedAt.
 * @returns true if newly added, false if it was already there (idempotent).
 */
export async function addWishlistItem(userId: string, productId: string): Promise<boolean> {
  try {
    await getDb().send(
      new PutCommand({
        TableName: getTableName(),
        Item: {
          ...keys.wishItem(userId, productId),
          entityType: "WISHLIST_ITEM",
          productId,
          addedAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalFailure(err)) return false;
    throw err;
  }
}

/** Removes a product from the wishlist (idempotent). */
export async function removeWishlistItem(userId: string, productId: string): Promise<void> {
  await getDb().send(new DeleteCommand({ TableName: getTableName(), Key: keys.wishItem(userId, productId) }));
}
