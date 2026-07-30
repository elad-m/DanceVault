import { randomUUID } from "node:crypto";
import {
    DeleteCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import {
    createVideo,
    deleteVideo,
    getVideoByID,
    listVideos,
    MAX_VIDEO_LIST_PAGE_SIZE,
    updateVideoStatus,
    updateVideoTitle,
    createDynamoDBVideoDataAccess,
} from "./dynamoDBVideoDataAccess";
import {
    createSegment,
    getSegmentByID,
} from "./dynamoDBSegmentDataAccess";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBVideoItem } from "./dynamoDBItems";
import {
    createSegmentPrimaryKey,
    createVideoPrimaryKey,
} from "./dynamoDBKeys";

const connection = createDynamoDBConnection();
const videoDataAccess =
    createDynamoDBVideoDataAccess(connection);

type WaitForVideoCountInput = {
    userID: string;
    expectedCount: number;
};

async function waitForVideoCount({
    userID,
    expectedCount,
}: WaitForVideoCountInput): Promise<DynamoDBVideoItem[]> {
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
        const createdAt = new Date();

        const itemKey = {
            PK: `USER#${userID}`,
            SK: `VIDEO#${videoID}`,
        };

        try {
            const createdVideo = await videoDataAccess.createVideo({
                videoID,
                userID,
                title: "Integration test video",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProvider: "awsS3",
                originalFileName: "video.mp4",
                status: "pending_upload",
                createdAt,
            });

            const readItem = await getVideoByID(connection, {
                userID,
                videoID,
            });

            expect(readItem).toMatchObject({
                PK: `USER#${userID}`,
                SK: `VIDEO#${videoID}`,
                videoID,
                userID,
                title: "Integration test video",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                status: "pending_upload",
                createdAt: createdAt.toISOString(),
            });

            // The adapter hides DynamoDB keys and translates stored field names and dates.
            const applicationVideo =
                await videoDataAccess.getVideoByID({
                    userID,
                    videoID,
                });
            expect(applicationVideo).toEqual(createdVideo);
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
            storageKey: `users/${userID}/videos/${videoID}.mp4`,
            storageProviderName: "awsS3" as const,
            originalFileName: "video.mp4",
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

    it("lists videos across users for the storage audit", async () => {
        const firstUserID = `integration-user-${randomUUID()}`;
        const secondUserID = `integration-user-${randomUUID()}`;
        const firstVideoID = `integration-video-${randomUUID()}`;
        const secondVideoID = `integration-video-${randomUUID()}`;
        const videosToDelete = [
            {
                userID: firstUserID,
                videoID: firstVideoID,
            },
            {
                userID: secondUserID,
                videoID: secondVideoID,
            },
        ];

        try {
            await createVideo(connection, {
                videoID: firstVideoID,
                userID: firstUserID,
                title: "First user's video",
                storageKey: `users/${firstUserID}/videos/${firstVideoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "first.mp4",
                status: "ready",
                createdAt: new Date(
                    "2026-07-30T10:00:00.000Z"
                ),
            });
            await createVideo(connection, {
                videoID: secondVideoID,
                userID: secondUserID,
                title: "Second user's video",
                storageKey: `users/${secondUserID}/videos/${secondVideoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "second.mp4",
                status: "ready",
                createdAt: new Date(
                    "2026-07-30T11:00:00.000Z"
                ),
            });

            const videos =
                await videoDataAccess.listAllVideosForStorageAudit();

            expect(
                videos.map((video) => video.id)
            ).toEqual(
                expect.arrayContaining([
                    firstVideoID,
                    secondVideoID,
                ])
            );
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
                storageKey: `users/${userID}/videos/${laterVideoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "later.mp4",
                status: "ready",
                createdAt: new Date(
                    "2026-07-21T11:00:00.000Z"
                ),
            });

            await createVideo(connection, {
                videoID: earlierVideoID,
                userID,
                title: "Earlier video",
                storageKey: `users/${userID}/videos/${earlierVideoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "earlier.mp4",
                status: "ready",
                createdAt: new Date(
                    "2026-07-21T10:00:00.000Z"
                ),
            });

            await createVideo(connection, {
                videoID: otherVideoID,
                userID: otherUserID,
                title: "Another user's video",
                storageKey: `users/${otherUserID}/videos/${otherVideoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "other.mp4",
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
            // The adapter returns application-shaped videos in the same chronological order.
            const applicationVideos =
                await videoDataAccess.listVideos({
                    userID,
                });
            expect(
                applicationVideos.map((video) => ({
                    id: video.id,
                    environment: video.environment,
                    createdAt: video.createdAt,
                }))
            ).toEqual([
                {
                    id: earlierVideoID,
                    environment: "dev",
                    createdAt: new Date(
                        "2026-07-21T10:00:00.000Z"
                    ),
                },
                {
                    id: laterVideoID,
                    environment: "dev",
                    createdAt: new Date(
                        "2026-07-21T11:00:00.000Z"
                    ),
                },
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
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
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
                storageKey: `users/${ownerUserID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
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
    it("deletes a video when it has no segments", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const videoKey = createVideoPrimaryKey({
            userID,
            videoID,
        });

        try {
            const createdVideo = await createVideo(connection, {
                videoID,
                userID,
                title: "Video without segments",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                status: "ready",
                createdAt: new Date(),
            });

            const deletedVideo = await deleteVideo(connection, {
                userID,
                videoID,
            });

            // The delete returns the complete video item removed from DynamoDB.
            expect(deletedVideo).toEqual(createdVideo);

            const storedVideo = await getVideoByID(connection, {
                userID,
                videoID,
            });

            // A strongly consistent read confirms the video item is gone.
            expect(storedVideo).toBeNull();
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: videoKey,
                })
            );
        }
    });

    it("rejects deleting a video that still has a segment", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;
        const segmentID = `integration-segment-${randomUUID()}`;

        const videoKey = createVideoPrimaryKey({
            userID,
            videoID,
        });
        const segmentKey = createSegmentPrimaryKey({
            userID,
            segmentID,
        });

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Video with a segment",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                status: "ready",
                createdAt: new Date(),
            });

            await createSegment(connection, {
                segmentID,
                videoID,
                userID,
                name: "Existing segment",
                description: null,
                startMilliseconds: 1_000,
                endMilliseconds: 2_000,
                tags: [],
                difficulty: "easy",
                confidence: "low",
                practicePriority: "high",
                createdAt: new Date(),
            });

            await expect(
                deleteVideo(connection, {
                    userID,
                    videoID,
                })
            ).rejects.toBeInstanceOf(
                ConditionalCheckFailedException
            );

            // The rejected delete must leave both records unchanged.
            const storedVideo = await getVideoByID(connection, {
                userID,
                videoID,
            });
            const storedSegment = await getSegmentByID(connection, {
                userID,
                segmentID,
            });

            expect(storedVideo?.segmentCount).toBe(1);
            expect(storedSegment?.videoID).toBe(videoID);
        } finally {
            // Raw cleanup intentionally bypasses the application deletion rules.
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: segmentKey,
                })
            );
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: videoKey,
                })
            );
        }
    });
    it("rejects deleting a video owned by another user", async () => {
        const ownerUserID = `integration-owner-${randomUUID()}`;
        const otherUserID = `integration-other-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        const videoKey = createVideoPrimaryKey({
            userID: ownerUserID,
            videoID,
        });

        try {
            const createdVideo = await createVideo(connection, {
                videoID,
                userID: ownerUserID,
                title: "Another user's video",
                storageKey: `users/${ownerUserID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                status: "ready",
                createdAt: new Date(),
            });

            await expect(
                deleteVideo(connection, {
                    userID: otherUserID,
                    videoID,
                })
            ).rejects.toBeInstanceOf(
                ConditionalCheckFailedException
            );

            // The failed cross-user delete must leave the owner's video intact.
            const storedVideo = await getVideoByID(connection, {
                userID: ownerUserID,
                videoID,
            });

            expect(storedVideo).toEqual(createdVideo);
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: videoKey,
                })
            );
        }
    });
});
