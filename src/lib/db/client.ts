import { getEnv } from "@/lib/env";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Cache on globalThis so Next.js hot reloads (dev) and warm serverless invocations
// (Vercel) reuse one client and its HTTP connection pool instead of leaking new ones.
const globalForDynamo = globalThis as unknown as {
    __ddb?: DynamoDBDocumentClient;
};

/**
 * Builds the DynamoDB Document client.
 * Returns a client that reads/writes plain JS objects.
 */
function createClient(): DynamoDBDocumentClient {
    const env = getEnv();
    const base = new DynamoDBClient({
        region: env.APP_AWS_REGION,
        endpoint: env.DYNAMODB_ENDPOINT,
        maxAttempts: 3, // SDK retries throttling/5xx with exponential backoff
        credentials:
            env.APP_AWS_ACCESS_KEY_ID && env.APP_AWS_SECRET_ACCESS_KEY
                ? {
                      accessKeyId: env.APP_AWS_ACCESS_KEY_ID,
                      secretAccessKey: env.APP_AWS_SECRET_ACCESS_KEY,
                  }
                : undefined,
    });
    //removeUndefinedValues prevents runtime errors when the optional fields are undefined
    return DynamoDBDocumentClient.from(base, {
        marshallOptions: { removeUndefinedValues: true },
    });
}

/** Returns the shared Document client (created lazily on first use). */
export function getDb(): DynamoDBDocumentClient {
    return (globalForDynamo.__ddb ??= createClient());
}

/** Name of the single application table, read from configuration. */
export function getTableName(): string {
    return getEnv().DYNAMODB_TABLE_NAME;
}
