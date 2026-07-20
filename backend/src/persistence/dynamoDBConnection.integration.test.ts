import { randomUUID } from "node:crypto";
import {
    DeleteCommand,
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";

const database = createDynamoDBConnection();

describe("DynamoDB connection integration", () => {
    afterAll(() => {
        database.close();
    });

    it("creates, reads, and deletes an item", async () => {
        const itemKey = {
            PK: `INTEGRATION_TEST#${randomUUID()}`,
            SK: "CONNECTION",
        };

        try {
            await database.documentClient.send(
                new PutCommand({
                    TableName: database.tableName,
                    Item: {
                        ...itemKey,
                        entityType: "integrationTest",
                        message: "DanceVault DynamoDB integration test",
                    },
                })
            );

            const readResult =
                await database.documentClient.send(
                    new GetCommand({
                        TableName: database.tableName,
                        Key: itemKey,
                        ConsistentRead: true,
                    })
                );

            expect(readResult.Item).toMatchObject({
                ...itemKey,
                entityType: "integrationTest",
                message: "DanceVault DynamoDB integration test",
            });

            await database.documentClient.send(
                new DeleteCommand({
                    TableName: database.tableName,
                    Key: itemKey,
                })
            );

            const resultAfterDeletion =
                await database.documentClient.send(
                    new GetCommand({
                        TableName: database.tableName,
                        Key: itemKey,
                        ConsistentRead: true,
                    })
                );

            expect(resultAfterDeletion.Item).toBeUndefined();
        } finally {
            await database.documentClient.send(
                new DeleteCommand({
                    TableName: database.tableName,
                    Key: itemKey,
                })
            );
        }
    });
});