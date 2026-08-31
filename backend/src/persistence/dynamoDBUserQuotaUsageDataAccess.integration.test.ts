import { randomUUID } from "node:crypto";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    DeleteCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import {
    createSegmentPrimaryKey,
    createUserQuotaUsagePrimaryKey,
    createVideoPrimaryKey,
} from "./dynamoDBKeys";
import {
    createDynamoDBVideoItem,
    createSegmentItem,
} from "./dynamoDBItems";
import {
    backfillUserQuotaUsage,
    createUserQuotaUsage,
    getOrCreateUserQuotaUsage,
    getUserQuotaUsage,
    listUserQuotaReconciliationSources,
} from "./dynamoDBUserQuotaUsageDataAccess";

const connection = createDynamoDBConnection();

describe("DynamoDB user quota usage data access integration", () => {
    afterAll(() => {
        connection.close();
    });

    it("creates and consistently reads a user's quota counters without allowing a reset", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const primaryKey =
            createUserQuotaUsagePrimaryKey(userID);

        const input = {
            userID,
            storedVideoBytes: 800_000_000,
            pendingVideoBytes: 100_000_000,
            videoCount: 12,
            segmentCount: 80,
            pendingVideoUploadCount: 1,
        };

        try {
            const createdItem = await createUserQuotaUsage(
                connection,
                input
            );

            await expect(
                createUserQuotaUsage(connection, input)
            ).rejects.toBeInstanceOf(
                ConditionalCheckFailedException
            );

            expect(
                await getUserQuotaUsage(connection, userID)
            ).toEqual(createdItem);
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: primaryKey,
                })
            );
        }
    });

    it("backfills missing quota counters without replacing conflicting usage", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const primaryKey =
            createUserQuotaUsagePrimaryKey(userID);
        const input = {
            userID,
            storedVideoBytes: 800_000_000,
            pendingVideoBytes: 100_000_000,
            videoCount: 12,
            segmentCount: 80,
            pendingVideoUploadCount: 1,
        };

        try {
            const backfilledItem =
                await backfillUserQuotaUsage(
                    connection,
                    input
                );

            await expect(
                backfillUserQuotaUsage(connection, input)
            ).resolves.toEqual(backfilledItem);

            await expect(
                backfillUserQuotaUsage(connection, {
                    ...input,
                    videoCount: 13,
                })
            ).rejects.toBeInstanceOf(
                ConditionalCheckFailedException
            );

            expect(
                await getUserQuotaUsage(connection, userID)
            ).toEqual(backfilledItem);
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: primaryKey,
                })
            );
        }
    });

    it("initializes one zeroed quota item for concurrent new-user requests without resetting existing usage", async () => {
        const newUserID = `integration-user-${randomUUID()}`;
        const existingUserID = `integration-user-${randomUUID()}`;
        const existingInput = {
            userID: existingUserID,
            storedVideoBytes: 800_000_000,
            pendingVideoBytes: 100_000_000,
            videoCount: 12,
            segmentCount: 80,
            pendingVideoUploadCount: 1,
        };

        try {
            const initializedItems = await Promise.all(
                Array.from({ length: 5 }, () =>
                    getOrCreateUserQuotaUsage(
                        connection,
                        newUserID
                    )
                )
            );

            expect(initializedItems).toEqual(
                Array.from({ length: 5 }, () =>
                    initializedItems[0]
                )
            );
            expect(initializedItems[0]).toMatchObject({
                userID: newUserID,
                storedVideoBytes: 0,
                pendingVideoBytes: 0,
                videoCount: 0,
                segmentCount: 0,
                pendingVideoUploadCount: 0,
            });

            const existingItem = await createUserQuotaUsage(
                connection,
                existingInput
            );

            await expect(
                getOrCreateUserQuotaUsage(
                    connection,
                    existingUserID
                )
            ).resolves.toEqual(existingItem);
        } finally {
            for (const userID of [newUserID, existingUserID]) {
                await connection.documentClient.send(
                    new DeleteCommand({
                        TableName: connection.tableName,
                        Key: createUserQuotaUsagePrimaryKey(
                            userID
                        ),
                    })
                );
            }
        }
    });

    it("groups source records and persisted counters by user for reconciliation", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;
        const segmentID = `integration-segment-${randomUUID()}`;
        const createdAt = new Date();

        const videoItem = createDynamoDBVideoItem({
            userID,
            videoID,
            title: "Quota reconciliation video",
            storageKey: `users/${userID}/videos/${videoID}.mp4`,
            storageProviderName: "awsS3",
            originalFileName: "video.mp4",
            fileSizeBytes: 100_000_000,
            status: "ready",
            createdAt,
        });
        const segmentItem = createSegmentItem({
            userID,
            videoID,
            segmentID,
            name: "Quota reconciliation segment",
            description: null,
            startMilliseconds: 1_000,
            endMilliseconds: 2_000,
            tags: [],
            difficulty: "medium",
            confidence: "medium",
            practicePriority: "medium",
            createdAt,
        });

        try {
            await connection.documentClient.send(
                new PutCommand({
                    TableName: connection.tableName,
                    Item: videoItem,
                })
            );
            await connection.documentClient.send(
                new PutCommand({
                    TableName: connection.tableName,
                    Item: segmentItem,
                })
            );
            await createUserQuotaUsage(connection, {
                userID,
                storedVideoBytes: 90_000_000,
                pendingVideoBytes: 0,
                videoCount: 1,
                segmentCount: 0,
                pendingVideoUploadCount: 0,
            });

            const sources =
                await listUserQuotaReconciliationSources(
                    connection
                );

            expect(
                sources.find(
                    (source) => source.userID === userID
                )
            ).toEqual({
                userID,
                videos: [
                    {
                        id: videoID,
                        status: "ready",
                        fileSizeBytes: 100_000_000,
                        storageKey: videoItem.storageKey,
                        storageProviderName: "awsS3",
                    },
                ],
                segmentCount: 1,
                persistedUsage: {
                    storedVideoBytes: 90_000_000,
                    pendingVideoBytes: 0,
                    videoCount: 1,
                    segmentCount: 0,
                    pendingVideoUploadCount: 0,
                },
            });
        } finally {
            for (const key of [
                createSegmentPrimaryKey({
                    userID,
                    segmentID,
                }),
                createVideoPrimaryKey({
                    userID,
                    videoID,
                }),
                createUserQuotaUsagePrimaryKey(userID),
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
