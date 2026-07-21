import { randomUUID } from "node:crypto";
import {
    DeleteCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import {
    createVideo,
    getVideoByID,
} from "./dynamoDBVideoDataAccess";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

const connection = createDynamoDBConnection();

describe("DynamoDB video data access integration", () => {
    afterAll(() => {
        connection.close();
    });

    it("creates and reads a video item in DynamoDB", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const itemKey = {
            PK: `USER#${userID}`,
            SK: `VIDEO#${videoID}`,
        };

        try {
            const createdItem = await createVideo(connection, {
                videoID,
                userID,
                title: "Integration test video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=test",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(),
            });

            const readItem = await getVideoByID(connection, {
                userID,
                videoID,
            });

            expect(readItem).toEqual(createdItem);
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: itemKey,
                })
            );
        }
    });

    it("does not overwrite an existing video item", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const itemKey = {
            PK: `USER#${userID}`,
            SK: `VIDEO#${videoID}`,
        };

        const input = {
            videoID,
            userID,
            title: "Original video",
            sourceType: "youtube" as const,
            sourceURL: "https://youtube.com/watch?v=original",
            storageKey: null,
            storageProviderName: null,
            originalFileName: null,
            status: "ready" as const,
            createdAt: new Date(),
        };

        try {
            await createVideo(connection, input);

            await expect(
                createVideo(connection, {
                    ...input,
                    title: "Replacement video",
                })
            ).rejects.toBeInstanceOf(ConditionalCheckFailedException);

            const readItem = await getVideoByID(connection, {
                userID,
                videoID,
            });

            expect(readItem).toMatchObject({
                title: "Original video",
            });
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: itemKey,
                })
            );
        }
    });

    it("returns null when the video does not exist", async () => {
        const result = await getVideoByID(connection, {
            userID: `missing-user-${randomUUID()}`,
            videoID: `missing-video-${randomUUID()}`,
        });

        expect(result).toBeNull();
    });

    it("rejects an unsupported video schema version", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const itemKey = {
            PK: `USER#${userID}`,
            SK: `VIDEO#${videoID}`,
        };

        try {
            await connection.documentClient.send(
                new PutCommand({
                    TableName: connection.tableName,
                    Item: {
                        ...itemKey,
                        entityType: "video",
                        schemaVersion: 999,
                    },
                })
            );

            await expect(
                getVideoByID(connection, {
                    userID,
                    videoID,
                })
            ).rejects.toThrow(
                "Unsupported video schema version: 999"
            );
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: itemKey,
                })
            );
        }
    });
});