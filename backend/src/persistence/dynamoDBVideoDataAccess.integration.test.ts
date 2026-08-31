import { randomUUID } from "node:crypto";
import {
    DeleteCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import {
    backfillVideoFileSizeBytes,
    createPendingVideoWithQuotaReservation,
    createVideo,
    deleteVideo,
    deleteVideoWithQuota,
    finalizeVideoUpload,
    finalizeVideoUploadWithQuota,
    getVideoByID,
    markVideoDeleting,
    listVideos,
    markVideoUploadFailedWithQuota,
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
    createUserQuotaUsagePrimaryKey,
    createVideoPrimaryKey,
} from "./dynamoDBKeys";
import {
    createUserQuotaUsage,
    getUserQuotaUsage,
} from "./dynamoDBUserQuotaUsageDataAccess";

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
                fileSizeBytes: 100_000_000,
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
                fileSizeBytes: 100_000_000,
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

            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                storedVideoBytes: 0,
                pendingVideoBytes: 100_000_000,
                videoCount: 1,
                segmentCount: 0,
                pendingVideoUploadCount: 1,
            });
        } finally {
            for (const key of [
                itemKey,
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

    it("atomically creates a pending video and reserves its user quota", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        try {
            await createUserQuotaUsage(connection, {
                userID,
                storedVideoBytes: 1_000,
                pendingVideoBytes: 500,
                videoCount: 2,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            });

            const video =
                await createPendingVideoWithQuotaReservation(
                    connection,
                    {
                        videoID,
                        userID,
                        title: "Reserved upload",
                        storageKey: `users/${userID}/videos/${videoID}.mp4`,
                        storageProviderName: "awsS3",
                        originalFileName: "video.mp4",
                        fileSizeBytes: 250,
                        status: "pending_upload",
                        createdAt: new Date(),
                    }
                );

            expect(video).toMatchObject({
                videoID,
                status: "pending_upload",
                fileSizeBytes: 250,
            });
            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                storedVideoBytes: 1_000,
                pendingVideoBytes: 750,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 2,
            });
        } finally {
            for (const key of [
                createVideoPrimaryKey({ userID, videoID }),
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

    it("preserves both quota reservations during concurrent new-user uploads", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const firstVideoID = `integration-video-${randomUUID()}`;
        const secondVideoID = `integration-video-${randomUUID()}`;

        try {
            await Promise.all([
                createPendingVideoWithQuotaReservation(
                    connection,
                    {
                        videoID: firstVideoID,
                        userID,
                        title: "First concurrent upload",
                        storageKey: `users/${userID}/videos/${firstVideoID}.mp4`,
                        storageProviderName: "awsS3",
                        originalFileName: "first.mp4",
                        fileSizeBytes: 100,
                        status: "pending_upload",
                        createdAt: new Date(),
                    }
                ),
                createPendingVideoWithQuotaReservation(
                    connection,
                    {
                        videoID: secondVideoID,
                        userID,
                        title: "Second concurrent upload",
                        storageKey: `users/${userID}/videos/${secondVideoID}.mp4`,
                        storageProviderName: "awsS3",
                        originalFileName: "second.mp4",
                        fileSizeBytes: 200,
                        status: "pending_upload",
                        createdAt: new Date(),
                    }
                ),
            ]);

            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                storedVideoBytes: 0,
                pendingVideoBytes: 300,
                videoCount: 2,
                segmentCount: 0,
                pendingVideoUploadCount: 2,
            });
            await expect(
                Promise.all([
                    getVideoByID(connection, {
                        userID,
                        videoID: firstVideoID,
                    }),
                    getVideoByID(connection, {
                        userID,
                        videoID: secondVideoID,
                    }),
                ])
            ).resolves.toEqual([
                expect.objectContaining({
                    videoID: firstVideoID,
                }),
                expect.objectContaining({
                    videoID: secondVideoID,
                }),
            ]);
        } finally {
            for (const key of [
                createVideoPrimaryKey({
                    userID,
                    videoID: firstVideoID,
                }),
                createVideoPrimaryKey({
                    userID,
                    videoID: secondVideoID,
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

    it("atomically completes a pending video and moves its reservation to stored bytes", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        try {
            await createUserQuotaUsage(connection, {
                userID,
                storedVideoBytes: 1_000,
                pendingVideoBytes: 500,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 2,
            });
            await createVideo(connection, {
                videoID,
                userID,
                title: "Pending upload to complete",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                fileSizeBytes: 250,
                status: "pending_upload",
                createdAt: new Date(),
            });

            const completedVideo =
                await finalizeVideoUploadWithQuota(
                    connection,
                    {
                        userID,
                        videoID,
                        fileSizeBytes: 275,
                    }
                );

            expect(completedVideo).toMatchObject({
                status: "ready",
                fileSizeBytes: 275,
            });
            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                storedVideoBytes: 1_275,
                pendingVideoBytes: 250,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            });

            await expect(
                finalizeVideoUploadWithQuota(connection, {
                    userID,
                    videoID,
                    fileSizeBytes: 275,
                })
            ).resolves.toEqual(completedVideo);
            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                storedVideoBytes: 1_275,
                pendingVideoBytes: 250,
                pendingVideoUploadCount: 1,
            });
        } finally {
            for (const key of [
                createVideoPrimaryKey({ userID, videoID }),
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

    it("keeps the pending video and quota unchanged when actual bytes exceed storage quota", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;
        const originalUsage = {
            userID,
            storedVideoBytes: 9_999_999_700,
            pendingVideoBytes: 250,
            videoCount: 1,
            segmentCount: 0,
            pendingVideoUploadCount: 1,
        };

        try {
            await createUserQuotaUsage(
                connection,
                originalUsage
            );
            await createVideo(connection, {
                videoID,
                userID,
                title: "Upload beyond remaining quota",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                fileSizeBytes: 250,
                status: "pending_upload",
                createdAt: new Date(),
            });

            await expect(
                finalizeVideoUploadWithQuota(connection, {
                    userID,
                    videoID,
                    fileSizeBytes: 400,
                })
            ).rejects.toMatchObject({
                limitName: "stored_video_bytes",
            });

            expect(
                await getVideoByID(connection, {
                    userID,
                    videoID,
                })
            ).toMatchObject({
                status: "pending_upload",
                fileSizeBytes: 250,
            });
            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject(originalUsage);
        } finally {
            for (const key of [
                createVideoPrimaryKey({ userID, videoID }),
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

    it("marks an upload failed and releases its pending quota reservation once", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        try {
            await createUserQuotaUsage(connection, {
                userID,
                storedVideoBytes: 1_000,
                pendingVideoBytes: 500,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 2,
            });
            await createVideo(connection, {
                videoID,
                userID,
                title: "Pending upload to fail",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "failed.mp4",
                fileSizeBytes: 250,
                status: "pending_upload",
                createdAt: new Date(),
            });

            const failedVideo =
                await markVideoUploadFailedWithQuota(
                    connection,
                    { userID, videoID }
                );

            expect(failedVideo).toMatchObject({
                videoID,
                status: "upload_failed",
                fileSizeBytes: 250,
            });
            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                storedVideoBytes: 1_000,
                pendingVideoBytes: 250,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            });

            await expect(
                markVideoUploadFailedWithQuota(connection, {
                    userID,
                    videoID,
                })
            ).resolves.toEqual(failedVideo);
            expect(
                await getUserQuotaUsage(connection, userID)
            ).toMatchObject({
                pendingVideoBytes: 250,
                pendingVideoUploadCount: 1,
            });
        } finally {
            for (const key of [
                createVideoPrimaryKey({ userID, videoID }),
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

    it("reads an existing video that does not have a stored file size", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Existing video without size metadata",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "existing-video.mp4",
                status: "ready",
                createdAt: new Date(),
            });

            const video = await videoDataAccess.getVideoByID({
                userID,
                videoID,
            });

            expect(video?.fileSizeBytes).toBeNull();
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: {
                        PK: `USER#${userID}`,
                        SK: `VIDEO#${videoID}`,
                    },
                })
            );
        }
    });

    it("finalizes an upload with its storage-verified file size", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Upload awaiting verification",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "video.mp4",
                fileSizeBytes: 90_000_000,
                status: "pending_upload",
                createdAt: new Date(),
            });

            const finalizedVideo = await finalizeVideoUpload(
                connection,
                {
                    userID,
                    videoID,
                    fileSizeBytes: 100_000_000,
                }
            );

            expect(finalizedVideo).toMatchObject({
                status: "ready",
                fileSizeBytes: 100_000_000,
            });
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: {
                        PK: `USER#${userID}`,
                        SK: `VIDEO#${videoID}`,
                    },
                })
            );
        }
    });

    it("backfills a missing file size without overwriting existing metadata", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Legacy video without size metadata",
                storageKey: `users/${userID}/videos/${videoID}.mp4`,
                storageProviderName: "awsS3",
                originalFileName: "legacy-video.mp4",
                status: "ready",
                createdAt: new Date(),
            });

            const backfilledVideo =
                await backfillVideoFileSizeBytes(connection, {
                    userID,
                    videoID,
                    fileSizeBytes: 100_000_000,
                });

            expect(backfilledVideo.fileSizeBytes).toBe(
                100_000_000
            );

            await expect(
                backfillVideoFileSizeBytes(connection, {
                    userID,
                    videoID,
                    fileSizeBytes: 100_000_000,
                })
            ).resolves.toMatchObject({
                fileSizeBytes: 100_000_000,
            });

            await expect(
                backfillVideoFileSizeBytes(connection, {
                    userID,
                    videoID,
                    fileSizeBytes: 200_000_000,
                })
            ).rejects.toBeInstanceOf(
                ConditionalCheckFailedException
            );

            expect(
                await getVideoByID(connection, {
                    userID,
                    videoID,
                })
            ).toMatchObject({
                fileSizeBytes: 100_000_000,
            });
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: createVideoPrimaryKey({
                        userID,
                        videoID,
                    }),
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

    it.each([
        "pending_upload",
        "ready",
        "upload_failed",
    ] as const)(
        "preserves the %s source status when marking a video as deleting",
        async (sourceStatus) => {
            const userID =
                `integration-user-${randomUUID()}`;
            const videoID =
                `integration-video-${randomUUID()}`;
            const itemKey = createVideoPrimaryKey({
                userID,
                videoID,
            });

            try {
                await createVideo(connection, {
                    videoID,
                    userID,
                    title: "Video entering deletion",
                    storageKey:
                        `users/${userID}/videos/${videoID}.mp4`,
                    storageProviderName: "awsS3",
                    originalFileName: "video.mp4",
                    fileSizeBytes: 1_000,
                    status: sourceStatus,
                    createdAt: new Date(),
                });

                const deletingVideo =
                    await markVideoDeleting(connection, {
                        userID,
                        videoID,
                    });

                expect(deletingVideo).toMatchObject({
                    status: "deleting",
                    deletionSourceStatus: sourceStatus,
                });

                const repeatedResult =
                    await markVideoDeleting(connection, {
                        userID,
                        videoID,
                    });

                expect(repeatedResult).toMatchObject({
                    status: "deleting",
                    deletionSourceStatus: sourceStatus,
                });
            } finally {
                await connection.documentClient.send(
                    new DeleteCommand({
                        TableName: connection.tableName,
                        Key: itemKey,
                    })
                );
            }
        }
    );

    it.each([
        {
            sourceStatus: "ready" as const,
            currentUsage: {
                storedVideoBytes: 1_500,
                pendingVideoBytes: 300,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            },
            expectedUsage: {
                storedVideoBytes: 500,
                pendingVideoBytes: 300,
                videoCount: 2,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            },
        },
        {
            sourceStatus: "pending_upload" as const,
            currentUsage: {
                storedVideoBytes: 500,
                pendingVideoBytes: 1_300,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 2,
            },
            expectedUsage: {
                storedVideoBytes: 500,
                pendingVideoBytes: 300,
                videoCount: 2,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            },
        },
        {
            sourceStatus: "upload_failed" as const,
            currentUsage: {
                storedVideoBytes: 500,
                pendingVideoBytes: 300,
                videoCount: 3,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            },
            expectedUsage: {
                storedVideoBytes: 500,
                pendingVideoBytes: 300,
                videoCount: 2,
                segmentCount: 4,
                pendingVideoUploadCount: 1,
            },
        },
    ])(
        "atomically releases $sourceStatus video quota during deletion",
        async ({
            sourceStatus,
            currentUsage,
            expectedUsage,
        }) => {
            const userID =
                `integration-user-${randomUUID()}`;
            const videoID =
                `integration-video-${randomUUID()}`;
            const videoKey = createVideoPrimaryKey({
                userID,
                videoID,
            });
            const quotaKey =
                createUserQuotaUsagePrimaryKey(userID);

            try {
                await createVideo(connection, {
                    videoID,
                    userID,
                    title: "Quota-counted video deletion",
                    storageKey:
                        `users/${userID}/videos/${videoID}.mp4`,
                    storageProviderName: "awsS3",
                    originalFileName: "video.mp4",
                    fileSizeBytes: 1_000,
                    status: sourceStatus,
                    createdAt: new Date(),
                });
                await createUserQuotaUsage(connection, {
                    userID,
                    ...currentUsage,
                });
                await markVideoDeleting(connection, {
                    userID,
                    videoID,
                });

                await deleteVideoWithQuota(connection, {
                    userID,
                    videoID,
                });

                expect(
                    await getVideoByID(connection, {
                        userID,
                        videoID,
                    })
                ).toBeNull();
                expect(
                    await getUserQuotaUsage(connection, userID)
                ).toMatchObject(expectedUsage);

                await expect(
                    deleteVideoWithQuota(connection, {
                        userID,
                        videoID,
                    })
                ).resolves.toBeUndefined();
                expect(
                    await getUserQuotaUsage(connection, userID)
                ).toMatchObject(expectedUsage);
            } finally {
                for (const key of [videoKey, quotaKey]) {
                    await connection.documentClient.send(
                        new DeleteCommand({
                            TableName: connection.tableName,
                            Key: key,
                        })
                    );
                }
            }
        }
    );

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
