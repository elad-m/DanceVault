import { randomUUID } from "node:crypto";
import {
    DeleteCommand,
    GetCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import {
    createUserAccountPrimaryKey,
    createUserPartitionKey,
} from "./dynamoDBKeys";
import { createDynamoDBUserAccountDataAccess } from "./dynamoDBUserAccountDataAccess";
import { createDynamoDBUserAccountDeletionDataAccess } from "./dynamoDBUserAccountDeletionDataAccess";

const connection = createDynamoDBConnection();
const userAccountDataAccess =
    createDynamoDBUserAccountDataAccess(connection);
const userAccountDeletionDataAccess =
    createDynamoDBUserAccountDeletionDataAccess(connection);

describe("DynamoDB user account deletion data access integration", () => {
    afterAll(() => {
        connection.close();
    });

    it("deletes one user's data in batches and completes only the matching lifecycle", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const otherUserID = `integration-user-${randomUUID()}`;
        const partitionKey = createUserPartitionKey(userID);
        const otherUserKey = {
            PK: createUserPartitionKey(otherUserID),
            SK: "RETAINED",
        };
        const dataKeys = Array.from(
            { length: 30 },
            (_, index) => ({
                PK: partitionKey,
                SK: `TEST#${index.toString().padStart(2, "0")}`,
            })
        );
        const deletionRequestedAt =
            "2026-09-10T12:00:00.000Z";
        const deletionCompletedAt =
            new Date("2026-09-10T12:30:00.000Z");

        try {
            await userAccountDataAccess.startUserAccountDeletion({
                userID,
                requestedAt: new Date(deletionRequestedAt),
            });

            for (const key of [...dataKeys, otherUserKey]) {
                await connection.documentClient.send(
                    new PutCommand({
                        TableName: connection.tableName,
                        Item: {
                            ...key,
                            entityType: "integrationTestData",
                        },
                    })
                );
            }

            await userAccountDeletionDataAccess.deleteUserData({
                userID,
            });

            const remainingUserItems =
                await connection.documentClient.send(
                    new QueryCommand({
                        TableName: connection.tableName,
                        KeyConditionExpression: "PK = :partitionKey",
                        ExpressionAttributeValues: {
                            ":partitionKey": partitionKey,
                        },
                        ConsistentRead: true,
                    })
                );

            expect(remainingUserItems.Items).toHaveLength(1);
            await expect(
                userAccountDataAccess.getUserAccountLifecycle({
                    userID,
                })
            ).resolves.toEqual({
                status: "deleting",
                deletionRequestedAt,
            });
            await expect(
                connection.documentClient.send(
                    new GetCommand({
                        TableName: connection.tableName,
                        Key: otherUserKey,
                        ConsistentRead: true,
                    })
                )
            ).resolves.toMatchObject({
                Item: expect.objectContaining(otherUserKey),
            });

            await expect(
                userAccountDeletionDataAccess
                    .completeUserAccountDeletion({
                        userID,
                        deletionRequestedAt:
                            "2026-09-11T12:00:00.000Z",
                        completedAt: deletionCompletedAt,
                    })
            ).rejects.toThrow(
                "Account deletion lifecycle no longer matches the job"
            );

            await userAccountDeletionDataAccess
                .completeUserAccountDeletion({
                    userID,
                    deletionRequestedAt,
                    completedAt: deletionCompletedAt,
                });

            await expect(
                userAccountDataAccess.getUserAccountLifecycle({
                    userID,
                })
            ).resolves.toEqual({
                status: "deleted",
                deletionRequestedAt,
            });

            await expect(
                connection.documentClient.send(
                    new GetCommand({
                        TableName: connection.tableName,
                        Key: createUserAccountPrimaryKey(userID),
                        ConsistentRead: true,
                    })
                )
            ).resolves.toMatchObject({
                Item: expect.objectContaining({
                    status: "deleted",
                    deletionCompletedAt:
                        deletionCompletedAt.toISOString(),
                    expiresAt:
                        Math.floor(
                            deletionCompletedAt.getTime() / 1_000
                        ) +
                        7 * 24 * 60 * 60,
                }),
            });
        } finally {
            for (const key of [
                ...dataKeys,
                createUserAccountPrimaryKey(userID),
                otherUserKey,
            ]) {
                await connection.documentClient.send(
                    new DeleteCommand({
                        TableName: connection.tableName,
                        Key: key,
                    })
                );
            }
        }
    });
});
