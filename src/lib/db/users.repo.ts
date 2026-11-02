import { ConflictError } from "@/lib/errors";
import type { UserRecord } from "@/types";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getDb, getTableName } from "./client";
import { isTransactionCancelled } from "./helpers";
import { keys, stripKeys } from "./keys";

/**
 * Creates a user and reserves their email atomically.
 * writes the profile item and an "email lock" item in one transaction.
 * Both Puts use attribute_not_exists(PK); if either exists the whole transaction cancels.
 * @throws ConflictError when the email is already registered.
 */
export async function createUser(user: UserRecord): Promise<void> {
    const TableName = getTableName();
    try {
        await getDb().send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Put: {
                            TableName,
                            Item: {
                                ...keys.user(user.id),
                                entityType: "USER",
                                ...user,
                            },
                            ConditionExpression: "attribute_not_exists(PK)",
                        },
                    },
                    {
                        Put: {
                            TableName,
                            Item: {
                                ...keys.emailLock(user.email),
                                entityType: "EMAIL_LOCK",
                                userId: user.id,
                            },
                            ConditionExpression: "attribute_not_exists(PK)",
                        },
                    },
                ],
            }),
        );
    } catch (err) {
        if (isTransactionCancelled(err))
            throw new ConflictError(
                "An account with this email already exists",
            );
        throw err;
    }
}

/** Fetches a user (including password hash) by id, or null. Used by session-related lookups. */
export async function getUserById(id: string): Promise<UserRecord | null> {
    const res = await getDb().send(
        new GetCommand({ TableName: getTableName(), Key: keys.user(id) }),
    );
    return res.Item ? stripKeys<UserRecord>(res.Item) : null;
}

/**
 * Looks a user up by (already lower-cased) email.
 */
export async function getUserByEmail(
    email: string,
): Promise<UserRecord | null> {
    const lock = await getDb().send(
        new GetCommand({
            TableName: getTableName(),
            Key: keys.emailLock(email),
        }),
    );
    const userId = lock.Item?.userId as string | undefined;
    return userId ? getUserById(userId) : null;
}
