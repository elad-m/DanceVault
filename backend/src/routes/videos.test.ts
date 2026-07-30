import {
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { buildApp } from "../app";
import {
    registerTestAuthentication,
    TEST_USER_ID,
    OTHER_TEST_USER_ID,
    OTHER_TEST_VIDEO_ID,
} from "../test/routeTestSupport";
import type {
    CreateVideoUploadUrlInput,
    VideoStorageProvider,
} from "../storage";
import type { VideoStorageProviderName } from "../domain/video";
import { resetRuntimeForTest } from "../runtime";
import type { PersistenceProvider } from "../persistence";
import type { VideoDataAccess } from "../persistence/videoDataAccess";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import {
    clearDynamoDBTestDatabase,
    createDynamoDBTestPersistenceProvider,
    createOtherUserDynamoDBTestData,
    resetDynamoDBTestDatabase,
} from "../test/dynamoDBTestDatabase";

const createVideoUploadUrlMock = vi.fn(
    async ({
        storageKey,
    }: CreateVideoUploadUrlInput): Promise<string> =>
        `http://storage.test/${storageKey}?X-Amz-Signature=test`
);
const createVideoPlaybackUrlMock = vi.fn(
    async (storageKey: string): Promise<string> =>
        `http://storage.test/${storageKey}?X-Amz-Signature=playback-test`
);
const videoObjectExistsMock = vi.fn(
    async (_storageKey: string): Promise<boolean> => false
);
const deleteVideoObjectMock = vi.fn(
    async (_storageKey: string): Promise<void> => { }
);
const fakeVideoStorageProvider: VideoStorageProvider = {
    name: "minio",
    bucketName: "test-video-bucket",
    createVideoPlaybackUrl: createVideoPlaybackUrlMock,
    createVideoUploadUrl: createVideoUploadUrlMock,
    deleteVideoObject: deleteVideoObjectMock,
    videoObjectExists: videoObjectExistsMock,
    listVideoObjectKeys: async () => [],
    close: () => { },
};

const unusedSegmentDataAccess: SegmentDataAccess = {
    async createSegment() {
        throw new Error("Not used by video route tests");
    },
    async getSegmentByID() {
        throw new Error("Not used by video route tests");
    },
    async listSegments() {
        throw new Error("Not used by video route tests");
    },
    async listSegmentsByVideo() {
        throw new Error("Not used by video route tests");
    },
    async updateSegmentMetadata() {
        throw new Error("Not used by video route tests");
    },
    async deleteSegment() {
        throw new Error("Not used by video route tests");
    },
};

const persistenceProvider =
    createDynamoDBTestPersistenceProvider();

const app = buildApp({
    videoStorageProvider: fakeVideoStorageProvider,
    persistenceProvider,
});
registerTestAuthentication(app);

type CreateTestVideoInput = {
    videoID: string;
    title: string;
    storageKey: string;
    storageProvider?: VideoStorageProviderName;
    originalFileName?: string;
    status?: "pending_upload" | "ready";
};

async function createTestVideo({
    videoID,
    title,
    storageKey,
    storageProvider = "minio",
    originalFileName = "lesson.mp4",
    status = "ready",
}: CreateTestVideoInput) {
    const createdVideo =
        await persistenceProvider.videoDataAccess.createVideo({
            videoID,
            userID: TEST_USER_ID,
            title,
            storageKey,
            storageProvider,
            originalFileName,
            status: "pending_upload",
            createdAt: new Date("2026-07-30T14:00:00.000Z"),
        });

    if (status === "pending_upload") {
        return createdVideo;
    }

    return persistenceProvider.videoDataAccess.updateVideoStatus({
        userID: TEST_USER_ID,
        videoID,
        status,
    });
}

beforeEach(async () => {
    resetRuntimeForTest();
    createVideoPlaybackUrlMock.mockClear();
    createVideoUploadUrlMock.mockClear();
    deleteVideoObjectMock.mockClear();
    videoObjectExistsMock.mockClear();
    videoObjectExistsMock.mockResolvedValue(false);
    await resetDynamoDBTestDatabase({
        persistenceProvider,
    });
});

afterAll(async () => {
    await clearDynamoDBTestDatabase();
    await app.close();
});

// Video routes

describe("video data access injection", () => {
    it("uses the injected video data access for read routes", async () => {
        const video = {
            id: "injected-video",
            userId: TEST_USER_ID,
            environment: "local" as const,
            title: "Injected video",
            storageKey: "test-videos/injected-video.mp4",
            storageProvider: "minio" as const,
            originalFileName: "injected-video.mp4",
            status: "ready" as const,
            createdAt: new Date("2026-07-27T10:00:00.000Z"),
        };

        const getVideoByIDMock = vi.fn(
            async () => video
        );
        const listVideosMock = vi.fn(
            async () => [video]
        );
        const closePersistenceMock = vi.fn(
            async () => { }
        );

        const persistenceProvider: PersistenceProvider = {
            videoDataAccess: {
                createVideo: vi.fn(async () => video),
                updateVideoStatus: vi.fn(async () => video),
                getVideoByID: getVideoByIDMock,
                listVideos: listVideosMock,
                updateVideoTitle: vi.fn(async () => {
                    throw new Error("Not used by this test");
                }),
                deleteVideo: vi.fn(async () => {
                    throw new Error("Not used by this test");
                }),
            },
            segmentDataAccess: unusedSegmentDataAccess,
            close: closePersistenceMock,
        };

        const injectedApp = buildApp({
            videoStorageProvider: fakeVideoStorageProvider,
            persistenceProvider,
        });
        registerTestAuthentication(injectedApp);

        try {
            const getResponse = await injectedApp.inject({
                method: "GET",
                url: `/videos/${video.id}`,
            });
            const listResponse = await injectedApp.inject({
                method: "GET",
                url: "/videos",
            });

            expect(getResponse.statusCode).toBe(200);
            expect(getResponse.json().id).toBe(video.id);
            expect(listResponse.statusCode).toBe(200);
            expect(listResponse.json().videos).toHaveLength(1);

            expect(
                getVideoByIDMock
            ).toHaveBeenCalledExactlyOnceWith({
                userID: TEST_USER_ID,
                videoID: video.id,
            });
            expect(
                listVideosMock
            ).toHaveBeenCalledExactlyOnceWith({
                userID: TEST_USER_ID,
            });
        } finally {
            await injectedApp.close();
        }

        expect(
            closePersistenceMock
        ).toHaveBeenCalledExactlyOnceWith();
    });
    it("uses the injected video data access when creating an upload", async () => {
        const createVideoMock = vi.fn<
            VideoDataAccess["createVideo"]
        >(async (input) => ({
            id: input.videoID,
            userId: input.userID,
            environment: "local",
            title: input.title,
            storageKey: input.storageKey,
            storageProvider: input.storageProvider,
            originalFileName: input.originalFileName,
            status: input.status,
            createdAt: input.createdAt,
        }));

        const persistenceProvider: PersistenceProvider = {
            videoDataAccess: {
                createVideo: createVideoMock,
                updateVideoStatus: vi.fn(async () => {
                    throw new Error("Not used by this test");
                }),
                getVideoByID: vi.fn(async () => null),
                listVideos: vi.fn(async () => []),
                updateVideoTitle: vi.fn(async () => {
                    throw new Error("Not used by this test");
                }),
                deleteVideo: vi.fn(async () => {
                    throw new Error("Not used by this test");
                }),
            },
            segmentDataAccess: unusedSegmentDataAccess,
            close: vi.fn(async () => { }),
        };

        const injectedApp = buildApp({
            videoStorageProvider: fakeVideoStorageProvider,
            persistenceProvider,
        });
        registerTestAuthentication(injectedApp);

        try {
            const response = await injectedApp.inject({
                method: "POST",
                url: "/video-uploads",
                payload: {
                    title: "Injected upload",
                    fileName: "lesson.mp4",
                    contentType: "video/mp4",
                },
            });

            expect(response.statusCode).toBe(201);

            expect(createVideoMock).toHaveBeenCalledExactlyOnceWith({
                videoID: expect.any(String),
                userID: TEST_USER_ID,
                title: "Injected upload",
                storageKey: expect.stringMatching(
                    /^users\/test-user-1\/videos\/[0-9a-f-]+\.mp4$/
                ),
                storageProvider: "minio",
                originalFileName: "lesson.mp4",
                status: "pending_upload",
                createdAt: expect.any(Date),
            });
        } finally {
            await injectedApp.close();
        }
    });
});

describe("POST /video-uploads", () => {
    it("creates a pending uploaded video with a server-owned storage key", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/video-uploads",
            payload: {
                title: "Uploaded salsa lesson",
                fileName: "lesson.mp4",
                contentType: "video/mp4",
            },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.video).toMatchObject({
            userId: TEST_USER_ID,
            title: "Uploaded salsa lesson",
            originalFileName: "lesson.mp4",
            status: "pending_upload",
            storageProvider: "minio",
            storageKey: expect.stringMatching(
                /^users\/test-user-1\/videos\/[0-9a-f-]+\.mp4$/
            ),
        });

        const storedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: body.video.id,
            });

        expect(body.uploadUrl).toEqual(expect.any(String));
        expect(body.uploadUrl).toContain(body.video.storageKey);
        expect(body.uploadUrl).toContain("X-Amz-Signature");
        expect(storedVideo).toMatchObject({
            status: "pending_upload",
            storageKey: body.video.storageKey,
        });
        expect(storedVideo?.storageProvider).toBe("minio");
    });

    it("rejects unsupported content types", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/video-uploads",
            payload: {
                title: "Invalid upload",
                fileName: "lesson.avi",
                contentType: "video/x-msvideo",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects a non-MP4 filename", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/video-uploads",
            payload: {
                title: "Mismatched upload",
                fileName: "lesson.mov",
                contentType: "video/mp4",
            },
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("POST /video-uploads/:videoId/complete", () => {
    async function createPendingUploadTestVideo() {
        return createTestVideo({
            videoID: "pending-upload-video",
            title: "Pending uploaded lesson",
            storageKey:
                "users/test-user-1/videos/pending-upload-video.mp4",
            status: "pending_upload",
        });
    }

    it("keeps the video pending when its storage object is missing", async () => {
        const video = await createPendingUploadTestVideo();

        const response = await app.inject({
            method: "POST",
            url: `/video-uploads/${video.id}/complete`,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
            error: {
                code: "VIDEO_UPLOAD_NOT_FOUND",
            },
        });
        expect(videoObjectExistsMock).toHaveBeenCalledWith(
            video.storageKey
        );

        const storedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });
        expect(storedVideo?.status).toBe("pending_upload");
    });

    it("marks the video ready when its storage object exists", async () => {
        const video = await createPendingUploadTestVideo();
        videoObjectExistsMock.mockResolvedValueOnce(true);

        const response = await app.inject({
            method: "POST",
            url: `/video-uploads/${video.id}/complete`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: video.id,
            status: "ready",
        });
        expect(videoObjectExistsMock).toHaveBeenCalledWith(
            video.storageKey
        );

        const storedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });
        expect(storedVideo?.status).toBe("ready");
    });

    it("returns an already-ready video without checking storage again", async () => {
        const video = await createPendingUploadTestVideo();
        await persistenceProvider.videoDataAccess.updateVideoStatus({
            userID: TEST_USER_ID,
            videoID: video.id,
            status: "ready",
        });

        const response = await app.inject({
            method: "POST",
            url: `/video-uploads/${video.id}/complete`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: video.id,
            status: "ready",
        });
        expect(videoObjectExistsMock).not.toHaveBeenCalled();
    });

    it("does not complete another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "POST",
            url: `/video-uploads/${OTHER_TEST_VIDEO_ID}/complete`,
        });

        expect(response.statusCode).toBe(404);
        expect(videoObjectExistsMock).not.toHaveBeenCalled();
    });
});

describe("GET /videos/:videoId", () => {
    it("returns an existing video", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos/sample-video-1",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: "sample-video-1",
            title: "Test lesson summary",
            storageKey: "test-videos/sample-video-1.mp4",
        });
    });

    it("returns 404 for a video that does not exist", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos/not-real",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "VIDEO_NOT_FOUND",
                message: "Video not found",
            },
        });
    });
});

describe("GET /videos/:videoId/playback-url", () => {
    async function createUploadedVideo(status: "pending_upload" | "ready") {
        return createTestVideo({
            videoID: `uploaded-video-${status}`,
            title: "Uploaded lesson",
            storageKey: `users/test-user-1/videos/${status}.mp4`,
            status,
        });
    }

    it("returns a signed playback URL for a ready uploaded video", async () => {
        const video = await createUploadedVideo("ready");

        const response = await app.inject({
            method: "GET",
            url: `/videos/${video.id}/playback-url`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            playbackUrl:
                `http://storage.test/${video.storageKey}` +
                "?X-Amz-Signature=playback-test",
            expiresInSeconds: 900,
        });
        expect(createVideoPlaybackUrlMock).toHaveBeenCalledWith(
            video.storageKey
        );
    });

    it("rejects playback while an upload is pending", async () => {
        const video = await createUploadedVideo("pending_upload");

        const response = await app.inject({
            method: "GET",
            url: `/videos/${video.id}/playback-url`,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
            error: {
                code: "VIDEO_NOT_READY",
            },
        });
        expect(createVideoPlaybackUrlMock).not.toHaveBeenCalled();
    });

    it("does not create a playback URL for another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "GET",
            url: `/videos/${OTHER_TEST_VIDEO_ID}/playback-url`,
        });

        expect(response.statusCode).toBe(404);
        expect(createVideoPlaybackUrlMock).not.toHaveBeenCalled();
    });
});

describe("GET /videos", () => {
    it("returns the stored videos", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().videos).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "sample-video-1",
                    title: "Test lesson summary",
                }),
            ])
        );
    });

});

describe("GET /videos/:videoId/segments", () => {
    it("returns the video's segments", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos/sample-video-1/segments",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().segments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "Open stance wave",
                }),
            ])
        );
    });

    it("returns 404 for a video that does not exist", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos/not-real/segments",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "VIDEO_NOT_FOUND",
                message: "Video not found",
            },
        });
    });
});

describe("PATCH /videos/:videoId", () => {
    it("updates the video title", async () => {
        const video = await createTestVideo({
            videoID: "video-before-update",
            title: "Video before update",
            storageKey: "test-videos/video-before-update.mp4",
            originalFileName: "video-before-update.mp4",
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/videos/${video.id}`,
            payload: {
                title: "Updated test lesson",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: video.id,
            title: "Updated test lesson",
        });

        const savedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });

        expect(savedVideo?.title).toBe("Updated test lesson");
    });

    it("rejects storage changes outside the upload workflow", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/videos/sample-video-1",
            payload: {
                storageKey: "test-videos/replacement.mp4",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("returns 404 for a video that does not exist", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/videos/not-real",
            payload: {
                title: "Missing video",
            },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "VIDEO_NOT_FOUND",
                message: "Video not found",
            },
        });
    });

    it("rejects an empty update", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/videos/sample-video-1",
            payload: {},
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("DELETE /videos/:videoId", () => {
    it("deletes a MinIO uploaded video's storage object and database record", async () => {
        const video = await createTestVideo({
            videoID: "uploaded-video-to-delete",
            title: "Uploaded video to delete",
            storageKey:
                "users/test-user-1/videos/uploaded-video-to-delete.mp4",
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${video.id}`,
        });

        expect(response.statusCode).toBe(204);
        expect(deleteVideoObjectMock).toHaveBeenCalledExactlyOnceWith(
            video.storageKey
        );

        const deletedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });

        expect(deletedVideo).toBeNull();
    });

    it("keeps the database record when storage deletion fails", async () => {
        const video = await createTestVideo({
            videoID: "storage-failure-video",
            title: "Uploaded video with storage failure",
            storageKey:
                "users/test-user-1/videos/storage-failure.mp4",
        });

        deleteVideoObjectMock.mockRejectedValueOnce(
            new Error("Storage deletion failed")
        );

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${video.id}`,
        });

        expect(response.statusCode).toBe(500);

        const retainedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });

        expect(retainedVideo).not.toBeNull();
    });

    it("rejects a video stored by a different provider", async () => {
        const video = await createTestVideo({
            videoID: "aws-video-to-delete",
            title: "AWS uploaded video to delete",
            storageKey:
                "users/test-user-1/videos/aws-video-to-delete.mp4",
            storageProvider: "awsS3",
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${video.id}`,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
            error: {
                code: "INVALID_VIDEO_UPLOAD_STATE",
            },
        });
        expect(deleteVideoObjectMock).not.toHaveBeenCalled();

        const retainedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });

        expect(retainedVideo).not.toBeNull();
    });

    it("deletes an uploaded video and its segments", async () => {
        const video = await createTestVideo({
            videoID: "video-with-segments",
            title: "Video to delete",
            storageKey: "test-videos/video-with-segments.mp4",
            originalFileName: "video-with-segments.mp4",
        });
        const segment =
            await persistenceProvider.segmentDataAccess.createSegment({
                segmentID: "segment-with-deleted-video",
                videoID: video.id,
                userID: TEST_USER_ID,
                name: "Dependent segment",
                description: null,
                startMilliseconds: 10000,
                endMilliseconds: 20000,
                tags: [],
                difficulty: "medium",
                confidence: "medium",
                practicePriority: "medium",
                createdAt: new Date("2026-07-30T14:01:00.000Z"),
            });

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${video.id}`,
        });

        expect(response.statusCode).toBe(204);
        expect(response.body).toBe("");
        expect(deleteVideoObjectMock).toHaveBeenCalledExactlyOnceWith(
            video.storageKey
        );

        const deletedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: TEST_USER_ID,
                videoID: video.id,
            });
        const deletedSegment =
            await persistenceProvider.segmentDataAccess.getSegmentByID({
                userID: TEST_USER_ID,
                segmentID: segment.id,
            });

        expect(deletedVideo).toBeNull();
        expect(deletedSegment).toBeNull();
    });

    it("returns 404 for a video that does not exist", async () => {
        const response = await app.inject({
            method: "DELETE",
            url: "/videos/not-real",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "VIDEO_NOT_FOUND",
                message: "Video not found",
            },
        });
    });
});

describe("Video ownership", () => {
    it("does not list another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "GET",
            url: "/videos",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().videos).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: OTHER_TEST_VIDEO_ID,
                }),
            ])
        );
    });

    it("returns 404 when reading another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "GET",
            url: `/videos/${OTHER_TEST_VIDEO_ID}`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("does not update another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/videos/${OTHER_TEST_VIDEO_ID}`,
            payload: {
                title: "Unauthorized update",
            },
        });

        expect(response.statusCode).toBe(404);

        const storedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: OTHER_TEST_USER_ID,
                videoID: OTHER_TEST_VIDEO_ID,
            });

        expect(storedVideo?.title).toBe("Another user's lesson");
    });

    it("does not delete another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${OTHER_TEST_VIDEO_ID}`,
        });

        expect(response.statusCode).toBe(404);

        const storedVideo =
            await persistenceProvider.videoDataAccess.getVideoByID({
                userID: OTHER_TEST_USER_ID,
                videoID: OTHER_TEST_VIDEO_ID,
            });

        expect(storedVideo).not.toBeNull();
    });

    it("does not return segments from another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "GET",
            url: `/videos/${OTHER_TEST_VIDEO_ID}/segments`,
        });

        expect(response.statusCode).toBe(404);
    });
});
