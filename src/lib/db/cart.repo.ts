import { ConflictError, NotFoundError } from "@/lib/errors";
import type { CartItemRecord } from "@/types";
import {
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDb, getTableName } from "./client";
import { isConditionalFailure } from "./helpers";
import { CART_PREFIX, keys, stripKeys } from "./keys";

/**
 * Returns all cart rows for a user.
 * A single Query on the user's partition with SK begins_with "CART#" - efficient because
 * cart rows are co-located with the user (no Scan).
 */
export async function listCartItems(userId: string): Promise<CartItemRecord[]> {
    const res = await getDb().send(
        new QueryCommand({
            TableName: getTableName(),
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":prefix": CART_PREFIX,
            },
        }),
    );
    return (res.Items ?? []).map((i) => stripKeys<CartItemRecord>(i));
}

/**
 * Adds `qty` to a cart line, creating it when missing - one atomic write.
 * The ConditionExpression enforces the per-line cap server-side: quantity may only grow while quantity <= cap - qty.
 * @returns the new quantity of the line.
 * @throws ConflictError when the cap would be exceeded.
 */
export async function incrementItem(
    userId: string,
    productId: string,
    qty: number,
    cap: number,
): Promise<number> {
    if (qty > cap)
        throw new ConflictError(`You can add at most ${cap} of this item`);
    const now = new Date().toISOString();
    try {
        const res = await getDb().send(
            new UpdateCommand({
                TableName: getTableName(),
                Key: keys.cartItem(userId, productId),
                UpdateExpression:
                    "SET quantity = if_not_exists(quantity, :zero) + :qty, productId = :pid, " +
                    "addedAt = if_not_exists(addedAt, :now), updatedAt = :now, entityType = :type",
                ConditionExpression:
                    "attribute_not_exists(quantity) OR quantity <= :room",
                ExpressionAttributeValues: {
                    ":zero": 0,
                    ":qty": qty,
                    ":pid": productId,
                    ":now": now,
                    ":type": "CART_ITEM",
                    ":room": cap - qty,
                },
                ReturnValues: "UPDATED_NEW",
            }),
        );
        return Number(res.Attributes?.quantity ?? qty);
    } catch (err) {
        if (isConditionalFailure(err))
            throw new ConflictError(
                `You can have at most ${cap} of this item in your cart`,
            );
        throw err;
    }
}

/**
 * Sets an existing line to an exact quantity.
 * Use a conditional update (attribute_exists) so we never resurrect a line that was removed
 * in another tab.
 * @throws NotFoundError when the line does not exist.
 */
export async function setQuantity(
    userId: string,
    productId: string,
    quantity: number,
): Promise<void> {
    try {
        await getDb().send(
            new UpdateCommand({
                TableName: getTableName(),
                Key: keys.cartItem(userId, productId),
                UpdateExpression: "SET quantity = :q, updatedAt = :now",
                ConditionExpression: "attribute_exists(PK)",
                ExpressionAttributeValues: {
                    ":q": quantity,
                    ":now": new Date().toISOString(),
                },
            }),
        );
    } catch (err) {
        if (isConditionalFailure(err))
            throw new NotFoundError("That item is not in your cart");
        throw err;
    }
}

/** Removes a line. Deleting a missing line succeeds silently. */
export async function removeItem(
    userId: string,
    productId: string,
): Promise<void> {
    await getDb().send(
        new DeleteCommand({
            TableName: getTableName(),
            Key: keys.cartItem(userId, productId),
        }),
    );
}
