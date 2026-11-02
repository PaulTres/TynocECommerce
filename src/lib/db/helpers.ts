import { ConditionalCheckFailedException, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ValidationError } from "@/lib/errors";

/** True when a conditional write failed its ConditionExpression (e.g. "already exists"). */
export function isConditionalFailure(err: unknown): boolean {
  return err instanceof ConditionalCheckFailedException;
}

/** True when a TransactWrite was cancelled because one of its conditions failed. */
export function isTransactionCancelled(err: unknown): boolean {
  return err instanceof TransactionCanceledException;
}

/**
 * Encodes DynamoDB's LastEvaluatedKey as an opaque URL-safe cursor string.
 * Clients get a stable "next page" token without learning the key schema.
 */
export function encodeCursor(key: Record<string, unknown> | undefined): string | null {
  return key ? Buffer.from(JSON.stringify(key), "utf8").toString("base64url") : null;
}

/**
 * Decodes a cursor back into an ExclusiveStartKey.
 * Cursors come from the query string so they are untrusted; verify the shape
 * (flat object of strings) and throw a 400 instead of passing garbage to DynamoDB.
 */
export function decodeCursor(cursor: string | undefined): Record<string, string> | undefined {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.length > 0 && entries.every(([, v]) => typeof v === "string")) {
        return Object.fromEntries(entries) as Record<string, string>;
      }
    }
  } catch {
    /* fall through to the validation error below */
  }
  throw new ValidationError("Invalid pagination cursor");
}

/** Splits an array into fixed-size chunks (DynamoDB BatchGet accepts at most 100 keys). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
