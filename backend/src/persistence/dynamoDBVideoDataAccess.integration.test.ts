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
    listVideos,
} from "./dynamoDBVideoDataAccess";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { VideoItem } from "./dynamoDBItems";
import { createVideoPrimaryKey } from "./dynamoDBKeys";

const connection = createDynamoDBConnection();

type WaitForVideoCountInput = {
    userID: string;
    expectedCount: number;
};

async function waitForVideoCount({
    userID,
    expectedCount,
}: WaitForVideoCountInput): Promise<VideoItem[]> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const videos = await listVideos(connection, {
            userID,
        });

        if (videos.length === expectedCount) {
            return videos;
        }

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 200);
        });
    }

    throw new Error(
        `Expected ${expectedCount} videos to appear in the index`
    );
}

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

    it("returns an empty list when the user has no videos", async () => {
        const videos = await listVideos(connection, {
            userID: `user-without-videos-${randomUUID()}`,
        });

        expect(videos).toEqual([]);
    });

    it("lists only the user's videos in chronological order", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const otherUserID =
            `integration-other-user-${randomUUID()}`;

        const earlierVideoID = randomUUID();
        const laterVideoID = randomUUID();
        const otherVideoID = randomUUID();

        const videosToDelete = [
            { userID, videoID: earlierVideoID },
            { userID, videoID: laterVideoID },
            {
                userID: otherUserID,
                videoID: otherVideoID,
            },
        ];

        try {
            // Create these out of order to prove the index sorts by date.
            await createVideo(connection, {
                videoID: laterVideoID,
                userID,
                title: "Later video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=later",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(
                    "2026-07-21T11:00:00.000Z"
                ),
            });

            await createVideo(connection, {
                videoID: earlierVideoID,
                userID,
                title: "Earlier video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=earlier",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(
                    "2026-07-21T10:00:00.000Z"
                ),
            });

            await createVideo(connection, {
                videoID: otherVideoID,
                userID: otherUserID,
                title: "Another user's video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=other",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(
                    "2026-07-21T09:00:00.000Z"
                ),
            });

            const videos = await waitForVideoCount({
                userID,
                expectedCount: 2,
            });

            await waitForVideoCount({
                userID: otherUserID,
                expectedCount: 1,
            });

            expect(videos.map((video) => video.videoID)).toEqual([
                earlierVideoID,
                laterVideoID,
            ]);
        } finally {
            await Promise.all(
                videosToDelete.map(({ userID, videoID }) =>
                    connection.documentClient.send(
                        new DeleteCommand({
                            TableName: connection.tableName,
                            Key: createVideoPrimaryKey({
                                userID,
                                videoID,
                            }),
                        })
                    )
                )
            );
        }
    });
});
