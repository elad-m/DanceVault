import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
    clearDynamoDBTestDatabase,
    createDynamoDBTestPersistenceProvider,
    resetDynamoDBTestDatabase,
} from "./dynamoDBTestDatabase";

const persistenceProvider =
    createDynamoDBTestPersistenceProvider();

beforeEach(async () => {
    await clearDynamoDBTestDatabase();
});

afterAll(async () => {
    await clearDynamoDBTestDatabase();
    await persistenceProvider.close();
});

describe("DynamoDB test database", () => {
    it("deletes every item from the test table", async () => {
        await persistenceProvider.videoDataAccess.createVideo({
            videoID: "cleanup-test-video",
            userID: "cleanup-test-user",
            title: "Cleanup test",
            storageKey: "test/cleanup-test-video.mp4",
            storageProvider: "minio",
            originalFileName: "cleanup-test-video.mp4",
            status: "pending_upload",
            createdAt: new Date("2026-07-30T10:00:00.000Z"),
        });

        expect(
            await persistenceProvider.videoDataAccess.listVideos({
                userID: "cleanup-test-user",
            })
        ).toHaveLength(1);

        await clearDynamoDBTestDatabase();

        expect(
            await persistenceProvider.videoDataAccess.listVideos({
                userID: "cleanup-test-user",
            })
        ).toEqual([]);
    });

    it("creates the standard video and segment fixtures", async () => {
        await resetDynamoDBTestDatabase({
            persistenceProvider,
        });

        const videos =
            await persistenceProvider.videoDataAccess.listVideos({
                userID: "test-user-1",
            });

        const segments =
            await persistenceProvider.segmentDataAccess.listSegmentsByVideo({
                userID: "test-user-1",
                videoID: "sample-video-1",
            });

        expect(videos).toHaveLength(1);
        expect(videos[0]).toMatchObject({
            id: "sample-video-1",
            status: "ready",
        });

        expect(segments.map((segment) => segment.id)).toEqual([
            "sample-segment-1",
            "sample-segment-2",
            "sample-segment-3",
        ]);
    });
});