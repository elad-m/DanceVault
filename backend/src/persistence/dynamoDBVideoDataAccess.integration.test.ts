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
    MAX_VIDEO_LIST_PAGE_SIZE,
    updateVideoStatus,
    updateVideoTitle,
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
        const page = await listVideos(connection, {
            userID,
            limit: MAX_VIDEO_LIST_PAGE_SIZE,
        });

        const videos = page.videos;

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
        const page = await listVideos(connection, {
            userID: `user-without-videos-${randomUUID()}`,
            limit: 10,
        });

        expect(page).toEqual({
            videos: [],
            nextCursor: null,
        });
    });

    it("lists a user's videos chronologically with ownership-scoped cursor pagination", async () => {
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

            // Wait until the eventually consistent index contains all test data.
            await waitForVideoCount({
                userID,
                expectedCount: 2,
            });

            await waitForVideoCount({
                userID: otherUserID,
                expectedCount: 1,
            });

            const firstPage = await listVideos(connection, {
                userID,
                limit: 1,
            });

            expect(
                firstPage.videos.map((video) => video.videoID)
            ).toEqual([earlierVideoID]);

            expect(firstPage.nextCursor).not.toBeNull();

            if (!firstPage.nextCursor) {
                throw new Error(
                    "Expected the first page to have a continuation cursor"
                );
            }

            await expect(
                listVideos(connection, {
                    userID: otherUserID,
                    limit: 1,
                    cursor: firstPage.nextCursor,
                })
            ).rejects.toThrow("Invalid video list cursor");

            const secondPage = await listVideos(connection, {
                userID,
                limit: 1,
                cursor: firstPage.nextCursor,
            });

            expect(
                [
                    ...firstPage.videos,
                    ...secondPage.videos,
                ].map((video) => video.videoID)
            ).toEqual([earlierVideoID, laterVideoID]);

            // DynamoDB may return a cursor when a page ends exactly at its limit,
            // even if resuming from that cursor produces no additional items.
            if (secondPage.nextCursor) {
                const terminalPage = await listVideos(
                    connection,
                    {
                        userID,
                        limit: 1,
                        cursor: secondPage.nextCursor,
                    }
                );

                expect(terminalPage).toEqual({
                    videos: [],
                    nextCursor: null,
                });
            }
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

    it("rejects video-list limits outside the supported range", async () => {
        const userID = `integration-user-${randomUUID()}`;

        await expect(
            listVideos(connection, {
                userID,
                limit: 0,
            })
        ).rejects.toThrow(
            "Video list limit must be between 1 and 50"
        );

        await expect(
            listVideos(connection, {
                userID,
                limit: 51,
            })
        ).rejects.toThrow(
            "Video list limit must be between 1 and 50"
        );
    });

    it("rejects a malformed video-list cursor", async () => {
        await expect(
            listVideos(connection, {
                userID: `integration-user-${randomUUID()}`,
                limit: 10,
                cursor: "not-a-valid-cursor",
            })
        ).rejects.toThrow("Invalid video list cursor");
    });

    it("updates a video's title", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const itemKey = createVideoPrimaryKey({
            userID,
            videoID,
        });

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Original title",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=update",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(),
            });

            const updatedVideo = await updateVideoTitle(
                connection,
                {
                    userID,
                    videoID,
                    title: "Updated title",
                }
            );

            expect(updatedVideo.title).toBe("Updated title");

            const storedVideo = await getVideoByID(connection, {
                userID,
                videoID,
            });

            expect(storedVideo).toMatchObject({
                title: "Updated title",
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

    it("does not let another user update a video's title", async () => {
        const ownerUserID =
            `integration-owner-${randomUUID()}`;
        const otherUserID =
            `integration-other-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const itemKey = createVideoPrimaryKey({
            userID: ownerUserID,
            videoID,
        });

        try {
            await createVideo(connection, {
                videoID,
                userID: ownerUserID,
                title: "Owner's title",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=owned",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(),
            });

            await expect(
                updateVideoTitle(connection, {
                    userID: otherUserID,
                    videoID,
                    title: "Unauthorized title",
                })
            ).rejects.toBeInstanceOf(
                ConditionalCheckFailedException
            );

            const storedVideo = await getVideoByID(connection, {
                userID: ownerUserID,
                videoID,
            });

            expect(storedVideo).toMatchObject({
                title: "Owner's title",
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

    it("updates an uploaded video's status", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const itemKey = createVideoPrimaryKey({
            userID,
            videoID,
        });

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Uploaded lesson",
                sourceType: "uploaded",
                sourceURL: null,
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "lesson.mp4",
                status: "pending_upload",
                createdAt: new Date(),
            });

            const updatedVideo = await updateVideoStatus(
                connection,
                {
                    userID,
                    videoID,
                    status: "ready",
                }
            );

            expect(updatedVideo.status).toBe("ready");

            const storedVideo = await getVideoByID(connection, {
                userID,
                videoID,
            });

            expect(storedVideo).toMatchObject({
                status: "ready",
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
});
