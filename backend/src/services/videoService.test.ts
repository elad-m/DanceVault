import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    clearDynamoDBTestDatabase,
    createDynamoDBTestPersistenceProvider,
    getDynamoDBTestUserQuotaUsage,
    resetDynamoDBTestDatabase,
} from "../test/dynamoDBTestDatabase";
import type { UserQuotaUsage } from "../domain/userQuota";
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
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";

const persistenceProvider =
    createDynamoDBTestPersistenceProvider();

const deleteSegmentExportObject = vi.fn(async () => undefined);
const segmentExportStorageProvider: SegmentExportStorageProvider = {
    async downloadSourceVideoToFile() { throw new Error("Not used"); },
    async uploadSegmentExportFromFile() { throw new Error("Not used"); },
    async createSegmentExportDownloadUrl() { throw new Error("Not used"); },
    deleteSegmentExportObject,
    close() {},
};

function executeTestVideoDeletion(
    input: Omit<
        Parameters<typeof executeVideoDeletion>[0],
        "segmentExportDataAccess" | "segmentExportStorageProvider"
    >
) {
    return executeVideoDeletion({
        ...input,
        segmentExportDataAccess:
            persistenceProvider.segmentExportDataAccess,
        segmentExportStorageProvider,
    });
}

const initialTestUserQuotaUsage: UserQuotaUsage = {
    storedVideoBytes: 100_000_000,
    pendingVideoBytes: 0,
    videoCount: 1,
    segmentCount: 3,
    pendingVideoUploadCount: 0,
};

const emptyTestUserQuotaUsage: UserQuotaUsage = {
    storedVideoBytes: 0,
    pendingVideoBytes: 0,
    videoCount: 0,
    segmentCount: 0,
    pendingVideoUploadCount: 0,
};

async function expectTestUserQuotaUsage(
    expectedUsage: UserQuotaUsage
): Promise<void> {
    expect(
        await getDynamoDBTestUserQuotaUsage(TEST_USER_ID)
    ).toEqual(expectedUsage);
}

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

type DeleteVideoThumbnailObject = (
    storageKey: string
) => Promise<void>;

function createFakeVideoStorageProvider(
    deleteVideoObject: DeleteVideoObject = async () => { },
    deleteSegmentThumbnailObject: DeleteSegmentThumbnailObject =
        async () => { },
    deleteVideoThumbnailObject: DeleteVideoThumbnailObject =
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

        async createVideoThumbnailUploadUrl() {
            throw new Error("Not used by deletion tests");
        },

        async createVideoThumbnailPlaybackUrl() {
            throw new Error("Not used by deletion tests");
        },

        async getVideoThumbnailObjectSizeBytes() {
            throw new Error("Not used by deletion tests");
        },

        deleteVideoThumbnailObject,

        async createSegmentThumbnailUploadUrl() {
            throw new Error("Not used by deletion tests");
        },

        async createSegmentThumbnailPlaybackUrl() {
            throw new Error("Not used by deletion tests");
        },

        async getSegmentThumbnailObjectSizeBytes() {
            throw new Error("Not used by deletion tests");
        },

        async moveSegmentThumbnailObject() {
            throw new Error("Not used by deletion tests");
        },

        deleteSegmentThumbnailObject,

        async listVideoObjectKeys() {
            throw new Error("Not used by deletion tests");
        },

        async deleteUserObjects() {
            throw new Error("Not used by deletion tests");
        },

        close(): void { },
    };
}

beforeEach(async () => {
    queuedJobs.length = 0;
    deleteSegmentExportObject.mockClear();

    await resetDynamoDBTestDatabase({
        persistenceProvider,
    });
});

afterAll(async () => {
    await clearDynamoDBTestDatabase();
    await persistenceProvider.close();
});

describe("executeVideoDeletion", () => {
    it("deletes segment exports with their source video", async () => {
        const exportInput = {
            exportID: "export-1",
            userID: TEST_USER_ID,
            segmentID: "sample-segment-1",
            videoID: "sample-video-1",
            sourceStorageKey:
                "users/test-user-1/videos/sample-video-1.mp4",
            outputStorageKey:
                "users/test-user-1/exports/segments/sample-segment-1/export-1.mp4",
            startMilliseconds: 1_000,
            endMilliseconds: 5_000,
            createdAt: new Date(),
        };
        await persistenceProvider.segmentExportDataAccess
            .createSegmentExport(exportInput);

        await executeTestVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider:
                createFakeVideoStorageProvider(),
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        expect(deleteSegmentExportObject).toHaveBeenCalledWith(
            exportInput.outputStorageKey
        );
        await expect(
            persistenceProvider.segmentExportDataAccess
                .getSegmentExport({
                    userID: TEST_USER_ID,
                    segmentID: "sample-segment-1",
                })
        ).resolves.toBeNull();
    });

    it("marks the video as deleting before destructive work begins", async () => {
        let statusObservedDuringStorageDeletion:
            string | undefined;
        let deletionSourceStatusObservedDuringStorageDeletion:
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
                    deletionSourceStatusObservedDuringStorageDeletion =
                        video?.deletionSourceStatus;
                }
            );

        const result = await executeTestVideoDeletion({
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
        expect(
            deletionSourceStatusObservedDuringStorageDeletion
        ).toBe("ready");
        expect(result).toEqual({
            kind: "deleted",
        });
        await expectTestUserQuotaUsage(
            emptyTestUserQuotaUsage
        );
    });

    it("keeps the deleting video and its segments when storage deletion fails", async () => {
        const videoStorageProvider =
            createFakeVideoStorageProvider(async () => {
                throw new Error("Storage unavailable");
            });

        await expect(
            executeTestVideoDeletion({
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
        await expectTestUserQuotaUsage(
            initialTestUserQuotaUsage
        );
    });

    it("completes deletion when retried after a storage failure", async () => {
        const failingStorageProvider =
            createFakeVideoStorageProvider(async () => {
                throw new Error("Temporary storage failure");
            });

        await expect(
            executeTestVideoDeletion({
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

        const retryResult = await executeTestVideoDeletion({
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
        await expectTestUserQuotaUsage(
            emptyTestUserQuotaUsage
        );
    });

    it("deletes the video and every segment thumbnail", async () => {
        const deletedSegmentThumbnailStorageKeys: string[] = [];
        const deletedVideoThumbnailStorageKeys: string[] = [];
        const videoStorageProvider = createFakeVideoStorageProvider(
            undefined,
            async (storageKey) => {
                deletedSegmentThumbnailStorageKeys.push(storageKey);
            },
            async (storageKey) => {
                deletedVideoThumbnailStorageKeys.push(storageKey);
            }
        );

        const result = await executeTestVideoDeletion({
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
        await expectTestUserQuotaUsage(
            emptyTestUserQuotaUsage
        );
        expect(deletedVideoThumbnailStorageKeys).toEqual([
            "users/test-user-1/thumbnails/videos/sample-video-1.jpg",
        ]);
        expect(deletedSegmentThumbnailStorageKeys).toEqual([
            "users/test-user-1/thumbnails/segments/sample-segment-1.jpg",
            "users/test-user-1/thumbnails/sample-segment-1.jpg",
            "users/test-user-1/thumbnails/segments/sample-segment-2.jpg",
            "users/test-user-1/thumbnails/sample-segment-2.jpg",
            "users/test-user-1/thumbnails/segments/sample-segment-3.jpg",
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
            executeTestVideoDeletion({
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
        await expectTestUserQuotaUsage({
            ...initialTestUserQuotaUsage,
            segmentCount: 2,
        });
    });

    it("does not modify a video stored by a different provider", async () => {
        let storageDeletionWasCalled = false;

        const videoStorageProvider: VideoStorageProvider = {
            ...createFakeVideoStorageProvider(async () => {
                storageDeletionWasCalled = true;
            }),
            name: "awsS3",
        };

        const result = await executeTestVideoDeletion({
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
        await expectTestUserQuotaUsage(
            initialTestUserQuotaUsage
        );
    });

    it("treats a repeated deletion after completion as already finished", async () => {
        let storageDeletionCallCount = 0;

        const videoStorageProvider =
            createFakeVideoStorageProvider(async () => {
                storageDeletionCallCount += 1;
            });

        const firstResult = await executeTestVideoDeletion({
            videoId: "sample-video-1",
            userId: TEST_USER_ID,
            videoStorageProvider,
            videoDataAccess:
                persistenceProvider.videoDataAccess,
            segmentDataAccess:
                persistenceProvider.segmentDataAccess,
        });

        const repeatedResult = await executeTestVideoDeletion({
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
        await expectTestUserQuotaUsage(
            emptyTestUserQuotaUsage
        );
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
