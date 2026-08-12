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
    OTHER_TEST_SEGMENT_ID,
    OTHER_TEST_USER_ID,
    OTHER_TEST_VIDEO_ID,
} from "../test/routeTestSupport";
import { resetRuntimeForTest } from "../runtime";
import {
    clearDynamoDBTestDatabase,
    createOtherUserDynamoDBTestData,
    createDynamoDBTestPersistenceProvider,
    resetDynamoDBTestDatabase,
} from "../test/dynamoDBTestDatabase";
import type { VideoStorageProvider } from "../storage";

const createSegmentThumbnailUploadUrlMock = vi.fn(
    async (storageKey: string): Promise<string> =>
        `http://storage.test/${storageKey}?upload=test`
);

const createSegmentThumbnailPlaybackUrlMock = vi.fn(
    async (storageKey: string): Promise<string> =>
        `http://storage.test/${storageKey}?playback=test`
);

const getSegmentThumbnailObjectSizeBytesMock = vi.fn(
    async (_storageKey: string): Promise<number | null> => null
);

const deleteSegmentThumbnailObjectMock = vi.fn(
    async (_storageKey: string): Promise<void> => { }
);

const fakeVideoStorageProvider: VideoStorageProvider = {
    name: "minio",
    bucketName: "test-video-bucket",

    async createVideoUploadUrl() {
        throw new Error("Not used by segment route tests");
    },
    async createVideoPlaybackUrl() {
        throw new Error("Not used by segment route tests");
    },
    async getVideoObjectSizeBytes() {
        throw new Error("Not used by segment route tests");
    },
    async deleteVideoObject() {
        throw new Error("Not used by segment route tests");
    },
    async listVideoObjectKeys() {
        throw new Error("Not used by segment route tests");
    },

    createSegmentThumbnailUploadUrl:
        createSegmentThumbnailUploadUrlMock,
    createSegmentThumbnailPlaybackUrl:
        createSegmentThumbnailPlaybackUrlMock,
    getSegmentThumbnailObjectSizeBytes:
        getSegmentThumbnailObjectSizeBytesMock,
    deleteSegmentThumbnailObject:
        deleteSegmentThumbnailObjectMock,

    close() { },
};

const persistenceProvider =
    createDynamoDBTestPersistenceProvider();

const app = buildApp({
    persistenceProvider,
    videoStorageProvider: fakeVideoStorageProvider,
});

registerTestAuthentication(app);

beforeEach(async () => {
    vi.clearAllMocks();
    getSegmentThumbnailObjectSizeBytesMock.mockResolvedValue(null);
    resetRuntimeForTest();

    await resetDynamoDBTestDatabase({
        persistenceProvider,
    });
});

afterAll(async () => {
    await clearDynamoDBTestDatabase();
    await app.close();
});

// Segment routes

describe("POST /videos/:videoId/segments", () => {
    it("creates a segment for an existing video", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Shoulder roll transition",
                description: "Keep the movement continuous.",
                startMilliseconds: 500000,
                endMilliseconds: 530000,
                tags: ["isolation", "transition"],
                difficulty: "hard",
                confidence: "low",
                practicePriority: "high",
            },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            videoId: "sample-video-1",
            name: "Shoulder roll transition",
            startMilliseconds: 500000,
            endMilliseconds: 530000,
            difficulty: "hard",
            confidence: "low",
            practicePriority: "high",
        });
    });

    it("rejects a segment for a video that does not exist", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/not-real/segments",
            payload: {
                name: "Missing video segment",
                startMilliseconds: 10000,
                endMilliseconds: 20000,
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

    it("rejects a new segment while its video is deleting", async () => {
        await persistenceProvider.videoDataAccess.updateVideoStatus({
            userID: TEST_USER_ID,
            videoID: "sample-video-1",
            status: "deleting",
        });

        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Too late segment",
                startMilliseconds: 10_000,
                endMilliseconds: 20_000,
            },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            error: {
                code: "VIDEO_DELETING",
                message: "Video is being deleted",
            },
        });
    });

    it("rejects a segment whose end is not after its start", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Invalid timestamp segment",
                startMilliseconds: 30000,
                endMilliseconds: 20000,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: {
                code: "INVALID_SEGMENT_TIMESTAMPS",
                message: "endMilliseconds must be greater than startMilliseconds",
            },
        });
    });

    it("rejects an unsupported difficulty value", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Invalid difficulty segment",
                startMilliseconds: 70000,
                endMilliseconds: 80000,
                difficulty: "impossible",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects an unsupported confidence value", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Invalid confidence segment",
                startMilliseconds: 90000,
                endMilliseconds: 100000,
                confidence: "uncertain",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects an unsupported practice priority value", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Invalid priority segment",
                startMilliseconds: 110000,
                endMilliseconds: 120000,
                practicePriority: "urgent",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects a negative start time", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Negative timestamp segment",
                startMilliseconds: -1000,
                endMilliseconds: 10000,
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects timestamps with the wrong type", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Wrong timestamp type segment",
                startMilliseconds: "five",
                endMilliseconds: 10000,
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects tags containing non-string values", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Invalid tags segment",
                startMilliseconds: 130000,
                endMilliseconds: 140000,
                tags: ["wave", 42],
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects an empty segment name", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "",
                startMilliseconds: 150000,
                endMilliseconds: 160000,
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects unexpected properties", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Unexpected property segment",
                startMilliseconds: 170000,
                endMilliseconds: 180000,
                admin: true,
            },
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("GET /segments", () => {
    it("filters segments by tag", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments?tag=wave",
        });

        expect(response.statusCode).toBe(200);

        const body = response.json();

        expect(body.segments).toHaveLength(2);
        expect(
            body.segments.every((segment: { tags: string[] }) =>
                segment.tags.includes("wave")
            )
        ).toBe(true);
    });

    it("rejects an unsupported difficulty filter", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments?difficulty=impossible",
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects an unsupported confidence filter", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments?confidence=uncertain",
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects an unsupported practice priority filter", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments?practicePriority=urgent",
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects unknown query parameters", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments?sortBy=magic",
        });

        expect(response.statusCode).toBe(400);
    });

    it("paginates segment search results with a cursor", async () => {
        for (let index = 1; index <= 3; index++) {
            await persistenceProvider.segmentDataAccess.createSegment({
                segmentID: `pagination-segment-${index}`,
                videoID: "sample-video-1",
                userID: TEST_USER_ID,
                name: `Pagination segment ${index}`,
                description: null,
                startMilliseconds: index * 20000 - 10000,
                endMilliseconds: index * 20000,
                tags: ["pagination-test"],
                difficulty: "medium",
                confidence: "medium",
                practicePriority: "medium",
                createdAt: new Date(
                    `2026-07-30T11:0${index}:00.000Z`
                ),
            });
        }

        const firstPageResponse = await app.inject({
            method: "GET",
            url: "/segments?tag=pagination-test&limit=2",
        });

        expect(firstPageResponse.statusCode).toBe(200);

        const firstPage = firstPageResponse.json();
        expect(firstPage.segments).toHaveLength(2);
        expect(firstPage.nextCursor).toEqual(expect.any(String));

        const secondPageResponse = await app.inject({
            method: "GET",
            url: `/segments?tag=pagination-test&limit=2&cursor=${firstPage.nextCursor}`,
        });

        expect(secondPageResponse.statusCode).toBe(200);

        const secondPage = secondPageResponse.json();
        expect(secondPage.segments).toHaveLength(1);
        expect(secondPage.nextCursor).toBeNull();
        expect(secondPage.segments[0].id).not.toBe(firstPage.segments[1].id);
    });

    it("rejects invalid pagination limits", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments?limit=100",
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("GET /segments/:segmentId", () => {
    it("returns an existing segment", async () => {

        const response = await app.inject({
            method: "GET",
            url: "/segments/sample-segment-1",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: "sample-segment-1",
            name: "Open stance wave",
            videoId: "sample-video-1",
        });
    });

    it("returns 404 for a segment that does not exist", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/segments/not-real",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "SEGMENT_NOT_FOUND",
                message: "Segment not found",
            },
        });
    });
});

describe("PATCH /segments/:segmentId", () => {
    it("updates editable segment properties", async () => {


        const response = await app.inject({
            method: "PATCH",
            url: "/segments/sample-segment-1",
            payload: {
                name: "Updated open stance wave",
                description: "Updated description",
                tags: ["wave", "updated"],
                difficulty: "hard",
                confidence: "high",
                practicePriority: "low",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: "sample-segment-1",
            name: "Updated open stance wave",
            description: "Updated description",
            startMilliseconds: 10000,
            endMilliseconds: 20000,
            tags: ["wave", "updated"],
            difficulty: "hard",
            confidence: "high",
            practicePriority: "low",
        });

        const savedSegment =
            await persistenceProvider.segmentDataAccess.getSegmentByID({
                userID: TEST_USER_ID,
                segmentID: "sample-segment-1",
            });

        expect(savedSegment).toMatchObject({
            id: "sample-segment-1",
            name: "Updated open stance wave",
            startMilliseconds: 10000,
            endMilliseconds: 20000,
            confidence: "high",
            practicePriority: "low",
        });
    });

    it("returns 404 for a segment that does not exist", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/segments/not-real",
            payload: {
                confidence: "high",
            },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "SEGMENT_NOT_FOUND",
                message: "Segment not found",
            },
        });
    });

    it("rejects an empty update", async () => {

        const response = await app.inject({
            method: "PATCH",
            url: "/segments/sample-segment-1",
            payload: {},
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects unsupported update values", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/segments/sample-segment-1",
            payload: {
                confidence: "perfect",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects timestamp updates", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/segments/sample-segment-1",
            payload: {
                startMilliseconds: 20000,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            error: {
                code: "VALIDATION_ERROR",
            },
        });
    });
});

describe("DELETE /segments/:segmentId", () => {
    it("deletes an existing segment", async () => {
        const response = await app.inject({
            method: "DELETE",
            url: "/segments/sample-segment-3",
        });

        expect(response.statusCode).toBe(204);
        expect(
            deleteSegmentThumbnailObjectMock
        ).toHaveBeenCalledExactlyOnceWith(
            "users/test-user-1/thumbnails/sample-segment-3.jpg"
        );

        const deletedSegment =
            await persistenceProvider.segmentDataAccess.getSegmentByID({
                userID: TEST_USER_ID,
                segmentID: "sample-segment-3",
            });

        expect(deletedSegment).toBeNull();
    });

    it("keeps the segment when thumbnail deletion fails", async () => {
        deleteSegmentThumbnailObjectMock.mockRejectedValueOnce(
            new Error("Storage unavailable")
        );

        const response = await app.inject({
            method: "DELETE",
            url: "/segments/sample-segment-3",
        });

        expect(response.statusCode).toBe(500);

        const retainedSegment =
            await persistenceProvider.segmentDataAccess.getSegmentByID({
                userID: TEST_USER_ID,
                segmentID: "sample-segment-3",
            });

        expect(retainedSegment).not.toBeNull();
    });

    it("returns 404 for a segment that does not exist", async () => {
        const response = await app.inject({
            method: "DELETE",
            url: "/segments/not-real",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "SEGMENT_NOT_FOUND",
                message: "Segment not found",
            },
        });
        expect(
            deleteSegmentThumbnailObjectMock
        ).not.toHaveBeenCalled();
    });
});

describe("GET /practice-queue", () => {
    it("selects weak or high-priority segments in practice order", async () => {
        for (const segmentID of [
            "sample-segment-1",
            "sample-segment-2",
            "sample-segment-3",
        ]) {
            await persistenceProvider.segmentDataAccess.updateSegmentMetadata({
                userID: TEST_USER_ID,
                segmentID,
                confidence: "high",
                practicePriority: "low",
            });
        }

        const queueSegments = [
            {
                segmentID: "queue-high-low",
                name: "Queue high priority and low confidence",
                startMilliseconds: 300000,
                confidence: "low",
                practicePriority: "high",
            },
            {
                segmentID: "queue-high-high",
                name: "Queue high priority and high confidence",
                startMilliseconds: 320000,
                confidence: "high",
                practicePriority: "high",
            },
            {
                segmentID: "queue-medium-low",
                name: "Queue medium priority and low confidence",
                startMilliseconds: 340000,
                confidence: "low",
                practicePriority: "medium",
            },
            {
                segmentID: "queue-medium-medium",
                name: "Not queued medium segment",
                startMilliseconds: 360000,
                confidence: "medium",
                practicePriority: "medium",
            },
            {
                segmentID: "queue-low-high",
                name: "Not queued low-priority segment",
                startMilliseconds: 380000,
                confidence: "high",
                practicePriority: "low",
            },
        ] as const;

        for (const [index, segment] of queueSegments.entries()) {
            await persistenceProvider.segmentDataAccess.createSegment({
                ...segment,
                videoID: "sample-video-1",
                userID: TEST_USER_ID,
                description: null,
                endMilliseconds: segment.startMilliseconds + 10000,
                tags: ["practice-queue-test"],
                difficulty: "medium",
                createdAt: new Date(
                    `2026-07-30T12:0${index + 1}:00.000Z`
                ),
            });
        }

        const firstPageResponse = await app.inject({
            method: "GET",
            url: "/practice-queue?limit=2",
        });

        expect(firstPageResponse.statusCode).toBe(200);

        const firstPage = firstPageResponse.json();
        const firstPageSegmentIds = firstPage.segments.map(
            (segment: { id: string }) => segment.id
        );

        expect(firstPageSegmentIds).toEqual([
            "queue-high-low",
            "queue-high-high",
        ]);
        expect(firstPage.nextCursor).toBe("queue-high-high");

        const secondPageResponse = await app.inject({
            method: "GET",
            url: `/practice-queue?limit=2&cursor=${firstPage.nextCursor}`,
        });

        expect(secondPageResponse.statusCode).toBe(200);

        const secondPage = secondPageResponse.json();
        const secondPageSegmentIds = secondPage.segments.map(
            (segment: { id: string }) => segment.id
        );

        expect(secondPageSegmentIds).toEqual([
            "queue-medium-low",
        ]);
        expect(secondPage.nextCursor).toBeNull();
    });

    it("rejects invalid pagination limits", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/practice-queue?limit=100",
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("Segment ownership", () => {
    it("does not create a segment inside another user's video", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "POST",
            url: `/videos/${OTHER_TEST_VIDEO_ID}/segments`,
            payload: {
                name: "Unauthorized segment",
                startMilliseconds: 30000,
                endMilliseconds: 40000,
            },
        });

        expect(response.statusCode).toBe(404);

        const currentUserSegments =
            await persistenceProvider.segmentDataAccess.listSegments({
                userID: TEST_USER_ID,
            });

        expect(currentUserSegments).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "Unauthorized segment",
                }),
            ])
        );
    });

    it("returns 404 when reading another user's segment", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "GET",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("excludes another user's segments from collections", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const searchResponse = await app.inject({
            method: "GET",
            url: "/segments?tag=other-user-test",
        });

        expect(searchResponse.statusCode).toBe(200);
        expect(searchResponse.json().segments).toEqual([]);

        const queueResponse = await app.inject({
            method: "GET",
            url: "/practice-queue",
        });

        expect(queueResponse.statusCode).toBe(200);
        expect(queueResponse.json().segments).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: OTHER_TEST_SEGMENT_ID,
                }),
            ])
        );
    });

    it("does not update another user's segment", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}`,
            payload: {
                name: "Unauthorized update",
            },
        });

        expect(response.statusCode).toBe(404);

        const storedSegment =
            await persistenceProvider.segmentDataAccess.getSegmentByID({
                userID: OTHER_TEST_USER_ID,
                segmentID: OTHER_TEST_SEGMENT_ID,
            });

        expect(storedSegment).toMatchObject({
            name: "Another user's weak segment",
        });
    });

    it("does not delete another user's segment", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}`,
        });

        expect(response.statusCode).toBe(404);

        const storedSegment =
            await persistenceProvider.segmentDataAccess.getSegmentByID({
                userID: OTHER_TEST_USER_ID,
                segmentID: OTHER_TEST_SEGMENT_ID,
            });

        expect(storedSegment).not.toBeNull();
    });
});

describe("POST /segments/:segmentId/thumbnail-upload", () => {
    it("creates a signed upload URL for the user's segment", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/segments/sample-segment-1/thumbnail-upload",
            payload: {
                fileSizeBytes: 100_000,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            uploadUrl:
                "http://storage.test/users/test-user-1/thumbnails/sample-segment-1.jpg?upload=test",
            contentType: "image/jpeg",
            expiresInSeconds: 900,
        });
        expect(
            createSegmentThumbnailUploadUrlMock
        ).toHaveBeenCalledExactlyOnceWith(
            "users/test-user-1/thumbnails/sample-segment-1.jpg"
        );
    });

    it("does not create an upload URL for another user's segment", async () => {
        await createOtherUserDynamoDBTestData({
            persistenceProvider,
        });

        const response = await app.inject({
            method: "POST",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}/thumbnail-upload`,
            payload: {
                fileSizeBytes: 100_000,
            },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: {
                code: "SEGMENT_NOT_FOUND",
                message: "Segment not found",
            },
        });
        expect(
            createSegmentThumbnailUploadUrlMock
        ).not.toHaveBeenCalled();
    });

    it("rejects an announced thumbnail size above the limit", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/segments/sample-segment-1/thumbnail-upload",
            payload: {
                fileSizeBytes: 250_001,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(
            createSegmentThumbnailUploadUrlMock
        ).not.toHaveBeenCalled();
    });
});

describe("POST /segments/:segmentId/thumbnail-upload/complete",
    () => {
        it("completes an uploaded thumbnail within the size limit", async () => {
            getSegmentThumbnailObjectSizeBytesMock
                .mockResolvedValueOnce(100_000);

            const response = await app.inject({
                method: "POST",
                url:
                    "/segments/sample-segment-1" +
                    "/thumbnail-upload/complete",
            });

            expect(response.statusCode).toBe(204);
            expect(
                getSegmentThumbnailObjectSizeBytesMock
            ).toHaveBeenCalledExactlyOnceWith(
                "users/test-user-1/thumbnails/sample-segment-1.jpg"
            );
            expect(
                deleteSegmentThumbnailObjectMock
            ).not.toHaveBeenCalled();
        });

        it("rejects completion when the uploaded object is missing", async () => {
            const response = await app.inject({
                method: "POST",
                url:
                    "/segments/sample-segment-1" +
                    "/thumbnail-upload/complete",
            });
            // The mock returns null by default, simulating a missing object.
            expect(response.statusCode).toBe(409);
            expect(response.json()).toEqual({
                error: {
                    code: "SEGMENT_THUMBNAIL_UPLOAD_NOT_FOUND",
                    message:
                        "Uploaded segment thumbnail was not found",
                },
            });
        });

        it("deletes and rejects an oversized uploaded thumbnail", async () => {
            getSegmentThumbnailObjectSizeBytesMock
                .mockResolvedValueOnce(250_001);

            const response = await app.inject({
                method: "POST",
                url:
                    "/segments/sample-segment-1" +
                    "/thumbnail-upload/complete",
            });

            expect(response.statusCode).toBe(413);
            expect(response.json()).toEqual({
                error: {
                    code:
                        "SEGMENT_THUMBNAIL_UPLOAD_TOO_LARGE",
                    message:
                        "Segment thumbnail exceeds the upload-size limit",
                },
            });
            expect(
                deleteSegmentThumbnailObjectMock
            ).toHaveBeenCalledExactlyOnceWith(
                "users/test-user-1/thumbnails/sample-segment-1.jpg"
            );
        });

        it("does not inspect storage for a missing segment", async () => {
            const response = await app.inject({
                method: "POST",
                url:
                    "/segments/not-real" +
                    "/thumbnail-upload/complete",
            });

            expect(response.statusCode).toBe(404);
            expect(
                getSegmentThumbnailObjectSizeBytesMock
            ).not.toHaveBeenCalled();
        });
    }
);

describe(
    "GET /segments/:segmentId/thumbnail-playback-url",
    () => {
        it("returns a signed playback URL for an existing thumbnail", async () => {
            getSegmentThumbnailObjectSizeBytesMock
                .mockResolvedValueOnce(100_000);

            const response = await app.inject({
                method: "GET",
                url:
                    "/segments/sample-segment-1" +
                    "/thumbnail-playback-url",
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                playbackUrl:
                    "http://storage.test/" +
                    "users/test-user-1/thumbnails/" +
                    "sample-segment-1.jpg?playback=test",
                expiresInSeconds: 900,
            });
            expect(
                createSegmentThumbnailPlaybackUrlMock
            ).toHaveBeenCalledExactlyOnceWith(
                "users/test-user-1/thumbnails/sample-segment-1.jpg"
            );
        });

        it("returns not found when the thumbnail object is missing", async () => {
            const response = await app.inject({
                method: "GET",
                url:
                    "/segments/sample-segment-1" +
                    "/thumbnail-playback-url",
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual({
                error: {
                    code: "SEGMENT_THUMBNAIL_NOT_FOUND",
                    message: "Segment thumbnail was not found",
                },
            });
            expect(
                createSegmentThumbnailPlaybackUrlMock
            ).not.toHaveBeenCalled();
        });

        it("does not expose another user's thumbnail", async () => {
            await createOtherUserDynamoDBTestData({
                persistenceProvider,
            });

            const response = await app.inject({
                method: "GET",
                url:
                    `/segments/${OTHER_TEST_SEGMENT_ID}` +
                    "/thumbnail-playback-url",
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual({
                error: {
                    code: "SEGMENT_NOT_FOUND",
                    message: "Segment not found",
                },
            });
            expect(
                getSegmentThumbnailObjectSizeBytesMock
            ).not.toHaveBeenCalled();
            expect(
                createSegmentThumbnailPlaybackUrlMock
            ).not.toHaveBeenCalled();
        });
    }
);
