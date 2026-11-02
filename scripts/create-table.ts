/**
 * One-off provisioning script: creates the single DynamoDB table with its two GSIs.
 * Run:  pnpm run db:create     (reads .env.local)
 * Safe to re-run: an existing table is detected and left untouched.
 * User requires CreateTable permission.
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { getDb, getTableName } from "../src/lib/db/client";

async function main(): Promise<void> {
    const client = getDb();
    const TableName = getTableName();

    try {
        await client.send(new DescribeTableCommand({ TableName }));
        console.log(`Table "${TableName}" already exists - nothing to do.`);
        return;
    } catch (err) {
        if (!(err instanceof ResourceNotFoundException)) throw err;
    }

    await client.send(
        new CreateTableCommand({
            TableName,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: "S" },
                { AttributeName: "SK", AttributeType: "S" },
                { AttributeName: "GSI1PK", AttributeType: "S" },
                { AttributeName: "GSI1SK", AttributeType: "S" },
                { AttributeName: "GSI2PK", AttributeType: "S" },
                { AttributeName: "GSI2SK", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "PK", KeyType: "HASH" },
                { AttributeName: "SK", KeyType: "RANGE" },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: "GSI1",
                    KeySchema: [
                        { AttributeName: "GSI1PK", KeyType: "HASH" },
                        { AttributeName: "GSI1SK", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
                {
                    IndexName: "GSI2",
                    KeySchema: [
                        { AttributeName: "GSI2PK", KeyType: "HASH" },
                        { AttributeName: "GSI2SK", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
            ],
            // Protects against accidental deletion.
            DeletionProtectionEnabled: process.env.NODE_ENV === "production",
        }),
    );
    // Poll until the table and its indexes are active so the seed script can run right after.
    for (let i = 0; i < 30; i++) {
        const { Table } = await client.send(
            new DescribeTableCommand({ TableName }),
        );
        if (Table?.TableStatus === "ACTIVE") break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(`Created table "${TableName}".`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
