import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import {
    clearDynamoDBTestDatabase,
    createDynamoDBTestPersistenceProvider,
    resetDynamoDBTestDatabase,
} from "../test/dynamoDBTestDatabase";
import type {
    VideoDeletionJob,
    VideoDeletionQueue,
} from "../jobs/videoDeletionQueue";
import { TEST_USER_ID } from "../test/routeTestSupport";
import {
    executeVideoDeletion,
    requestVideoDeletion,
} from "./videoService";
import type { VideoStorageProvider } from "../storage";

const persistenceProvider =
    createDynamoDBTestPersistenceProvider();

const queuedJobs: VideoDeletionJob[] = [];

const videoDeletionQueue: VideoDeletionQueue = {
    async enqueue(job): Promise<void> {
        queuedJobs.push(job);
    },

    close(): void { },
};

type DeleteVideoObject = (
    storageKey: string
) => Promise<void>;

type DeleteSegmentThumbnailObject = (
    storageKey: string
) => Promise<void>;

function createFakeVideoStorageProvider(
    deleteVideoObject: DeleteVideoObject = async () => { },
    deleteSegmentThumbnailObject: DeleteSegmentThumbnailObject =
        async () => { }
): VideoStorageProvider {
    return {
        name: "minio",
        bucketName: "test-video-bucket",

        async createVideoPlaybackUrl() {
            throw new Error("Not used by deletion tests");
        },

        async createVideoUploadUrl() {
            throw new Error("Not used by deletion tests");
        },

        deleteVideoObject,

        async getVideoObjectSizeBytes() {
            throw new Error("Not used by deletion tests");
        },

        async createSegmentThumbnailUploadUrl() {
            throw new Error("Not used by deletion tests");
        },

        async createSegmentThumbnailPlaybackUrl() {
            throw new Error("Not used by deletion tests");
        },

        async getSegmentThumbnailObjectSizeBytes() {
            throw new Error("Not used by deletion tests");
        },

        deleteSegmentThumbnailObject,

        async listVideoObjectKeys() {
            throw new Error("Not used by deletion tests");
        },

        close(): void { },
    };
}

beforeEach(async () => {
    queuedJobs.length = 0;

    await resetDynamoDBTestDatabase({
        persistenceProvider,
    });
});

afterAll(async () => {
    await clearDynamoDBTestDatabase();
    await persistenceProvider.close();
});

describe("executeVideoDeletion", () => {
    it("marks the video as deleting before destructive work begins", async () => {
        let statusObservedDuringStorageDeletion:
            string | undefined;

        const videoStorageProvider =
            createFakeVideoStorageProvider(
                async () => {
                    const video =
                        await persistenceProvider.videoDataAccess.getVideoByID({
                            userID: TEST_USER_ID,
                            videoID: "sample-video-1",
                        });

                    statusObservedDuringStorageDeletion =
                        video?.status;
                }
            );

        const result = await executeVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        expect(
            statusObservedDuringStorageDeletion
        ).toBe("deleting");
        expect(result).toEqual({
            kind: "deleted",
        });
    });

    it("keeps the deleting video and its segments when storage deletion fails", async () => {
        const videoStorageProvider =
            createFakeVideoStorageProvider(async () => {
                throw new Error("Storage unavailable");
            });

        await expect(
            executeVideoDeletion({
                videoId: "sample-video-1",
                userId: TEST_USER_ID,
                videoStorageProvider,
                videoDataAccess:
                    persistenceProvider.videoDataAccess,
                segmentDataAccess:
                    persistenceProvider.segmentDataAccess,
            })
        ).rejects.toThrow("Storage unavailable");

        const retainedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        const retainedSegments =
            await persistenceProvider.segmentDataAccess.listSegmentsByVideo({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        expect(retainedVideo?.status).toBe("deleting");
        expect(retainedSegments.map((segment) => segment.id)).toEqual([
            "sample-segment-1",
            "sample-segment-2",
            "sample-segment-3",
        ]);
    });

    it("completes deletion when retried after a storage failure", async () => {
        const failingStorageProvider =
            createFakeVideoStorageProvider(async () => {
                throw new Error("Temporary storage failure");
            });

        await expect(
            executeVideoDeletion({
                videoId: "sample-video-1",
                userId: TEST_USER_ID,
                videoStorageProvider: failingStorageProvider,
                videoDataAccess:
                    persistenceProvider.videoDataAccess,
                segmentDataAccess:
                    persistenceProvider.segmentDataAccess,
            })
        ).rejects.toThrow("Temporary storage failure");

        const workingStorageProvider =
            createFakeVideoStorageProvider();

        const retryResult = await executeVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider: workingStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        const deletedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        const remainingSegments =
            await persistenceProvider.segmentDataAccess.listSegmentsByVideo({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        expect(retryResult).toEqual({
            kind: "deleted",
        });
        expect(deletedVideo).toBeNull();
        expect(remainingSegments).toEqual([]);
    });

    it("deletes every segment thumbnail during video deletion", async () => {
        const deletedThumbnailStorageKeys: string[] = [];
        const videoStorageProvider = createFakeVideoStorageProvider(
            undefined,
            async (storageKey) => {
                deletedThumbnailStorageKeys.push(storageKey);
            }
        );

        const result = await executeVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        expect(result).toEqual({
            kind: "deleted",
        });
        expect(deletedThumbnailStorageKeys).toEqual([
            "users/test-user-1/thumbnails/sample-segment-1.jpg",
            "users/test-user-1/thumbnails/sample-segment-2.jpg",
            "users/test-user-1/thumbnails/sample-segment-3.jpg",
        ]);
    });

    it("keeps failed and remaining segments when thumbnail deletion fails", async () => {
        const videoStorageProvider = createFakeVideoStorageProvider(
            undefined,
            async (storageKey) => {
                if (storageKey.endsWith("sample-segment-2.jpg")) {
                    throw new Error("Thumbnail storage unavailable");
                }
            }
        );

        await expect(
            executeVideoDeletion({
                videoId: "sample-video-1",
                userId: TEST_USER_ID,
                videoStorageProvider,
                videoDataAccess:
                    persistenceProvider.videoDataAccess,
                segmentDataAccess:
                    persistenceProvider.segmentDataAccess,
            })
        ).rejects.toThrow("Thumbnail storage unavailable");

        const retainedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });
        const retainedSegments =
            await persistenceProvider.segmentDataAccess.listSegmentsByVideo({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        expect(retainedVideo?.status).toBe("deleting");
        expect(retainedSegments.map((segment) => segment.id)).toEqual([
            "sample-segment-2",
            "sample-segment-3",
        ]);
    });

    it("does not modify a video stored by a different provider", async () => {
        let storageDeletionWasCalled = false;

        const videoStorageProvider: VideoStorageProvider = {
            ...createFakeVideoStorageProvider(async () => {
                storageDeletionWasCalled = true;
            }),
            name: "awsS3",
        };

        const result = await executeVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        const retainedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        const retainedSegments =
            await persistenceProvider.segmentDataAccess.listSegmentsByVideo({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        expect(result).toEqual({
            kind: "invalid_upload_state",
        });
        expect(storageDeletionWasCalled).toBe(false);
        expect(retainedVideo?.status).toBe("ready");
        expect(retainedSegments).toHaveLength(3);
    });

    it("treats a repeated deletion after completion as already finished", async () => {
        let storageDeletionCallCount = 0;

        const videoStorageProvider =
            createFakeVideoStorageProvider(async () => {
                storageDeletionCallCount += 1;
            });

        const firstResult = await executeVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        const repeatedResult = await executeVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        expect(firstResult).toEqual({
            kind: "deleted",
        });
        expect(repeatedResult).toEqual({
            kind: "not_found",
        });
        expect(storageDeletionCallCount).toBe(1);
    });
});

describe("requestVideoDeletion", () => {
    it("enqueues a versioned deletion job without deleting the video", async () => {
        const result = await requestVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            videoDeletionQueue,
        });

        expect(result.kind).toBe("queued");

        if (result.kind !== "queued") {
            throw new Error(
                "Expected deletion to be queued"
            );
        }

        expect(result.job).toMatchObject({
            schemaVersion: 1,
            userID: TEST_USER_ID,
            videoID: "sample-video-1",
            jobID: expect.any(String),
        });
        expect(queuedJobs).toEqual([result.job]);

        const storedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: "sample-video-1",
            });

        expect(storedVideo).not.toBeNull();
    });

    it("does not enqueue a job for a missing video", async () => {
        const result = await requestVideoDeletion({
            videoId: "missing-video",
            userId: TEST_USER_ID,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            videoDeletionQueue,
        });

        expect(result).toEqual({
            kind: "not_found",
        });
        expect(queuedJobs).toEqual([]);
    });
});
