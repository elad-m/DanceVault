import { randomUUID } from "node:crypto";
import {
    DeleteCommand,
    GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import {
    createSegment,
    getSegmentByID,
    listSegmentsByVideo,
    MAX_SEGMENTS_BY_VIDEO_PAGE_SIZE,
} from "./dynamoDBSegmentDataAccess";
import { createVideo } from "./dynamoDBVideoDataAccess";
import {
    createSegmentPrimaryKey,
    createVideoPrimaryKey,
} from "./dynamoDBKeys";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import type {
    CreateSegmentItemInput,
    SegmentItem,
} from "./dynamoDBItems";

const connection = createDynamoDBConnection();

type WaitForSegmentCountInput = {
    userID: string;
    videoID: string;
    expectedCount: number;
};

async function waitForSegmentCount({
    userID,
    videoID,
    expectedCount,
}: WaitForSegmentCountInput): Promise<SegmentItem[]> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const page = await listSegmentsByVideo(connection, {
            userID,
            videoID,
            limit: MAX_SEGMENTS_BY_VIDEO_PAGE_SIZE,
        });

        const segments = page.segments;

        if (segments.length === expectedCount) {
            return segments;
        }

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 200);
        });
    }

    throw new Error(
        `Expected ${expectedCount} segments to appear in the index`
    );
}

describe("DynamoDB segment data access integration", () => {
    afterAll(() => {
        connection.close();
    });

    it("creates and reads a segment only for its owner", async () => {
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
                title: "Segment parent video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=test",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(),
            });

            const createdSegment = await createSegment(connection, {
                segmentID,
                videoID,
                userID,
                name: "Integration test segment",
                description: null,
                startMilliseconds: 1_000,
                endMilliseconds: 2_000,
                tags: ["integration-test"],
                difficulty: "easy",
                confidence: "low",
                practicePriority: "high",
                videoSourceType: "youtube",
                videoSourceURL:
                    "https://youtube.com/watch?v=test",
                createdAt: new Date(),
            });

            const readSegment = await getSegmentByID(connection, {
                userID,
                segmentID,
            });

            // The owner can read the segment exactly as it was created.
            expect(readSegment).toEqual(createdSegment);

            const otherUsersReadSegment = await getSegmentByID(connection, {
                userID: `different-user-${randomUUID()}`,
                segmentID,
            });

            // A different user produces a different partition key and sees no segment.
            expect(otherUsersReadSegment).toBeNull();
        } finally {
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

    it("returns null when a segment does not exist", async () => {
        const segment = await getSegmentByID(connection, {
            userID: `integration-user-${randomUUID()}`,
            segmentID: `missing-segment-${randomUUID()}`,
        });

        // Missing primary keys are represented by null at the data-access boundary.
        expect(segment).toBeNull();
    });

    it("does not create a segment without its parent video", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `missing-video-${randomUUID()}`;
        const segmentID = `integration-segment-${randomUUID()}`;

        const segmentKey = createSegmentPrimaryKey({
            userID,
            segmentID,
        });

        try {
            // The transaction's parent-video condition cancels the segment write.
            await expect(
                createSegment(connection, {
                    segmentID,
                    videoID,
                    userID,
                    name: "Orphan segment",
                    description: null,
                    startMilliseconds: 1_000,
                    endMilliseconds: 2_000,
                    tags: [],
                    difficulty: "easy",
                    confidence: "low",
                    practicePriority: "high",
                    videoSourceType: "youtube",
                    videoSourceURL:
                        "https://youtube.com/watch?v=missing",
                    createdAt: new Date(),
                })
            ).rejects.toBeInstanceOf(TransactionCanceledException);

            const readResult =
                await connection.documentClient.send(
                    new GetCommand({
                        TableName: connection.tableName,
                        Key: segmentKey,
                        ConsistentRead: true,
                    })
                );

            // Inspect DynamoDB directly to prove the cancelled transaction wrote nothing.
            expect(readResult.Item).toBeUndefined();
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: segmentKey,
                })
            );
        }
    });

    it("does not overwrite an existing segment", async () => {
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

        const segmentInput: CreateSegmentItemInput = {
            segmentID,
            videoID,
            userID,
            name: "Original segment",
            description: null,
            startMilliseconds: 1_000,
            endMilliseconds: 2_000,
            tags: [],
            difficulty: "easy",
            confidence: "low",
            practicePriority: "high",
            videoSourceType: "youtube",
            videoSourceURL: "https://youtube.com/watch?v=test",
            createdAt: new Date(),
        };

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Segment parent video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=test",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(),
            });

            const originalSegment = await createSegment(
                connection,
                segmentInput
            );

            // The conditional put rejects a second item with the same primary key.
            await expect(
                createSegment(connection, {
                    ...segmentInput,
                    name: "Replacement segment",
                })
            ).rejects.toBeInstanceOf(TransactionCanceledException);

            const readResult =
                await connection.documentClient.send(
                    new GetCommand({
                        TableName: connection.tableName,
                        Key: segmentKey,
                        ConsistentRead: true,
                    })
                );

            // The rejected transaction leaves the original stored item unchanged.
            expect(readResult.Item).toEqual(originalSegment);
        } finally {
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

    it("lists a video's segments with ordered, ownership-scoped cursor pagination", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;
        const segmentIDs = {
            first: `integration-segment-${randomUUID()}`,
            second: `integration-segment-${randomUUID()}`,
            third: `integration-segment-${randomUUID()}`,
        };

        const videoKey = createVideoPrimaryKey({
            userID,
            videoID,
        });

        try {
            await createVideo(connection, {
                videoID,
                userID,
                title: "Segment list parent video",
                sourceType: "youtube",
                sourceURL: "https://youtube.com/watch?v=test",
                storageKey: null,
                storageProviderName: null,
                originalFileName: null,
                status: "ready",
                createdAt: new Date(),
            });

            const segmentTimes = [
                {
                    segmentID: segmentIDs.third,
                    startMilliseconds: 30_000,
                },
                {
                    segmentID: segmentIDs.first,
                    startMilliseconds: 10_000,
                },
                {
                    segmentID: segmentIDs.second,
                    startMilliseconds: 20_000,
                },
            ];

            for (const segment of segmentTimes) {
                await createSegment(connection, {
                    ...segment,
                    videoID,
                    userID,
                    name: segment.segmentID,
                    description: null,
                    endMilliseconds:
                        segment.startMilliseconds + 1_000,
                    tags: [],
                    difficulty: "easy",
                    confidence: "low",
                    practicePriority: "high",
                    videoSourceType: "youtube",
                    videoSourceURL:
                        "https://youtube.com/watch?v=test",
                    createdAt: new Date(),
                });
            }

            const listedSegments = await waitForSegmentCount({
                userID,
                videoID,
                expectedCount: 3,
            });

            // The index orders segments by padded start time, not insertion order.
            expect(
                listedSegments.map((segment) => segment.segmentID)
            ).toEqual([
                segmentIDs.first,
                segmentIDs.second,
                segmentIDs.third,
            ]);

            const firstPage = await listSegmentsByVideo(connection, {
                userID,
                videoID,
                limit: 2,
            });

            // The first page respects the limit and exposes a continuation cursor.
            expect(
                firstPage.segments.map((segment) => segment.segmentID)
            ).toEqual([
                segmentIDs.first,
                segmentIDs.second,
            ]);
            expect(firstPage.nextCursor).not.toBeNull();

            const nextCursor = firstPage.nextCursor;

            if (!nextCursor) {
                throw new Error("Expected a second segment page");
            }

            // A cursor cannot be reused by a different user.
            await expect(
                listSegmentsByVideo(connection, {
                    userID: `different-user-${randomUUID()}`,
                    videoID,
                    limit: 2,
                    cursor: nextCursor,
                })
            ).rejects.toThrow(
                "Invalid segments-by-video list cursor"
            );

            // A cursor cannot be reused for a different video owned by the same user.
            await expect(
                listSegmentsByVideo(connection, {
                    userID,
                    videoID: `different-video-${randomUUID()}`,
                    limit: 2,
                    cursor: nextCursor,
                })
            ).rejects.toThrow(
                "Invalid segments-by-video list cursor"
            );

            const secondPage = await listSegmentsByVideo(connection, {
                userID,
                videoID,
                limit: 2,
                cursor: nextCursor,
            });

            // The cursor resumes after page one and ends after the remaining segment.
            expect(
                secondPage.segments.map((segment) => segment.segmentID)
            ).toEqual([segmentIDs.third]);
            expect(secondPage.nextCursor).toBeNull();
        } finally {
            for (const segmentID of Object.values(segmentIDs)) {
                await connection.documentClient.send(
                    new DeleteCommand({
                        TableName: connection.tableName,
                        Key: createSegmentPrimaryKey({
                            userID,
                            segmentID,
                        }),
                    })
                );
            }

            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: videoKey,
                })
            );
        }
    });

    it("keeps segments separate for users sharing the same video ID", async () => {
        const firstUserID = `integration-user-${randomUUID()}`;
        const secondUserID = `integration-user-${randomUUID()}`;
        const videoID = `shared-video-${randomUUID()}`;
        const firstSegmentID = `integration-segment-${randomUUID()}`;
        const secondSegmentID = `integration-segment-${randomUUID()}`;

        try {
            for (const userID of [firstUserID, secondUserID]) {
                await createVideo(connection, {
                    videoID,
                    userID,
                    title: `${userID}'s video`,
                    sourceType: "youtube",
                    sourceURL: "https://youtube.com/watch?v=test",
                    storageKey: null,
                    storageProviderName: null,
                    originalFileName: null,
                    status: "ready",
                    createdAt: new Date(),
                });
            }

            await createSegment(connection, {
                segmentID: firstSegmentID,
                videoID,
                userID: firstUserID,
                name: "First user's segment",
                description: null,
                startMilliseconds: 1_000,
                endMilliseconds: 2_000,
                tags: [],
                difficulty: "easy",
                confidence: "low",
                practicePriority: "high",
                videoSourceType: "youtube",
                videoSourceURL: "https://youtube.com/watch?v=test",
                createdAt: new Date(),
            });

            await createSegment(connection, {
                segmentID: secondSegmentID,
                videoID,
                userID: secondUserID,
                name: "Second user's segment",
                description: null,
                startMilliseconds: 1_000,
                endMilliseconds: 2_000,
                tags: [],
                difficulty: "easy",
                confidence: "low",
                practicePriority: "high",
                videoSourceType: "youtube",
                videoSourceURL: "https://youtube.com/watch?v=test",
                createdAt: new Date(),
            });

            const firstUsersSegments = await waitForSegmentCount({
                userID: firstUserID,
                videoID,
                expectedCount: 1,
            });
            const secondUsersSegments = await waitForSegmentCount({
                userID: secondUserID,
                videoID,
                expectedCount: 1,
            });

            // Each ownership-scoped index partition contains only its user's segment.
            expect(firstUsersSegments.map((segment) => segment.segmentID))
                .toEqual([firstSegmentID]);
            expect(secondUsersSegments.map((segment) => segment.segmentID))
                .toEqual([secondSegmentID]);
        } finally {
            for (const [userID, segmentID] of [
                [firstUserID, firstSegmentID],
                [secondUserID, secondSegmentID],
            ]) {
                await connection.documentClient.send(
                    new DeleteCommand({
                        TableName: connection.tableName,
                        Key: createSegmentPrimaryKey({
                            userID,
                            segmentID,
                        }),
                    })
                );

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
        }
    });

    it("returns an empty page when no segments match the video key", async () => {
        const page = await listSegmentsByVideo(connection, {
            userID: `integration-user-${randomUUID()}`,
            videoID: `integration-video-${randomUUID()}`,
            limit: 10,
        });

        // An unmatched ownership-and-video index key has no continuation page.
        expect(page).toEqual({
            segments: [],
            nextCursor: null,
        });
    });

    it("rejects segment-list limits outside the supported range", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const videoID = `integration-video-${randomUUID()}`;

        // Zero is below the supported page-size range.
        await expect(
            listSegmentsByVideo(connection, {
                userID,
                videoID,
                limit: 0,
            })
        ).rejects.toThrow(
            "Segment list limit must be between 1 and 50"
        );

        // Fifty-one exceeds the supported page-size range.
        await expect(
            listSegmentsByVideo(connection, {
                userID,
                videoID,
                limit: 51,
            })
        ).rejects.toThrow(
            "Segment list limit must be between 1 and 50"
        );
    });

    it("rejects a malformed segments-by-video cursor", async () => {
        // The cursor must decode into the complete DynamoDB table and index key.
        await expect(
            listSegmentsByVideo(connection, {
                userID: `integration-user-${randomUUID()}`,
                videoID: `integration-video-${randomUUID()}`,
                limit: 10,
                cursor: "not-a-valid-cursor",
            })
        ).rejects.toThrow(
            "Invalid segments-by-video list cursor"
        );
    });
});
