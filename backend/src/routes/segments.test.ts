import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../db";
import {
    clearTestDatabase,
    registerTestAuthentication,
    resetTestDatabase,
    TEST_USER_ID,
    createOtherUserTestData,
    OTHER_TEST_SEGMENT_ID,
    OTHER_TEST_VIDEO_ID,
} from "../test/testDatabase";
import { resetRuntimeForTest, setRuntimeForTest } from "../runtime";

const app = buildApp();
registerTestAuthentication(app);

beforeEach(async () => {
    resetRuntimeForTest();
    await resetTestDatabase();
});

afterAll(async () => {
    await clearTestDatabase();
    await app.close();
    await prisma.$disconnect();
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
            playbackUrl:
                "https://youtube.com/watch?v=test-video&t=500s",
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

    it("does not create a segment inside a video from another app environment", async () => {
        await prisma.video.create({
            data: {
                id: "dev-video",
                userId: TEST_USER_ID,
                environment: "dev",
                title: "Dev-only lesson",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=dev-video",
            },
        });

        const response = await app.inject({
            method: "POST",
            url: "/videos/dev-video/segments",
            payload: {
                name: "Wrong environment segment",
                startMilliseconds: 10000,
                endMilliseconds: 20000,
            },
        });

        expect(response.statusCode).toBe(404);

        const storedSegment = await prisma.segment.findFirst({
            where: {
                name: "Wrong environment segment",
            },
        });

        expect(storedSegment).toBeNull();
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
        await prisma.video.create({
            data: {
                title: "Pagination lesson",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=pagination-test",
                user: {
                    connect: {
                        id: TEST_USER_ID,
                    },
                },
                segments: {
                    create: [
                        {
                            name: "Pagination segment 1",
                            startMilliseconds: 10000,
                            endMilliseconds: 20000,
                            tags: ["pagination-test"],
                        },
                        {
                            name: "Pagination segment 2",
                            startMilliseconds: 30000,
                            endMilliseconds: 40000,
                            tags: ["pagination-test"],
                        },
                        {
                            name: "Pagination segment 3",
                            startMilliseconds: 50000,
                            endMilliseconds: 60000,
                            tags: ["pagination-test"],
                        },
                    ],
                },
            },
        });

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

    it("does not list segments from another app environment", async () => {
        await prisma.video.create({
            data: {
                id: "dev-video",
                userId: TEST_USER_ID,
                environment: "dev",
                title: "Dev-only lesson",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=dev-video",
                segments: {
                    create: {
                        id: "dev-segment",
                        name: "Dev-only wave",
                        startMilliseconds: 10000,
                        endMilliseconds: 20000,
                        tags: ["dev-only"],
                    },
                },
            },
        });

        const localResponse = await app.inject({
            method: "GET",
            url: "/segments?tag=dev-only",
        });

        expect(localResponse.statusCode).toBe(200);
        expect(localResponse.json().segments).toEqual([]);

        setRuntimeForTest({ environment: "dev" });

        const devResponse = await app.inject({
            method: "GET",
            url: "/segments?tag=dev-only",
        });

        expect(devResponse.statusCode).toBe(200);
        expect(devResponse.json().segments).toEqual([
            expect.objectContaining({
                id: "dev-segment",
            }),
        ]);
    });
});

describe("GET /segments/:segmentId", () => {
    it("returns an existing segment", async () => {
        const existingSegment = await prisma.segment.findFirstOrThrow({
            where: {
                name: "Open stance wave",
            },
        });

        const response = await app.inject({
            method: "GET",
            url: `/segments/${existingSegment.id}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: existingSegment.id,
            name: "Open stance wave",
            videoId: "sample-video-1",
            playbackUrl:
                "https://youtube.com/watch?v=test-video&t=10s",
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
        const existingSegment = await prisma.segment.findFirstOrThrow({
            where: {
                name: "Open stance wave",
            },
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/segments/${existingSegment.id}`,
            payload: {
                name: "Updated open stance wave",
                description: "Updated description",
                startMilliseconds: 12000,
                endMilliseconds: 24000,
                tags: ["wave", "updated"],
                difficulty: "hard",
                confidence: "high",
                practicePriority: "low",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: existingSegment.id,
            name: "Updated open stance wave",
            description: "Updated description",
            startMilliseconds: 12000,
            endMilliseconds: 24000,
            tags: ["wave", "updated"],
            difficulty: "hard",
            confidence: "high",
            practicePriority: "low",
            playbackUrl:
                "https://youtube.com/watch?v=test-video&t=12s",
        });

        const savedSegment = await prisma.segment.findUniqueOrThrow({
            where: {
                id: existingSegment.id,
            },
        });

        expect(savedSegment.name).toBe("Updated open stance wave");
        expect(savedSegment.startMilliseconds).toBe(12000);
        expect(savedSegment.endMilliseconds).toBe(24000);
        expect(savedSegment.confidence).toBe("high");
        expect(savedSegment.practicePriority).toBe("low");
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
        const existingSegment = await prisma.segment.findFirstOrThrow();

        const response = await app.inject({
            method: "PATCH",
            url: `/segments/${existingSegment.id}`,
            payload: {},
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects unsupported update values", async () => {
        const existingSegment = await prisma.segment.findFirstOrThrow();

        const response = await app.inject({
            method: "PATCH",
            url: `/segments/${existingSegment.id}`,
            payload: {
                confidence: "perfect",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("validates timestamps using unchanged stored values", async () => {
        const existingSegment = await prisma.segment.findFirstOrThrow();

        const response = await app.inject({
            method: "PATCH",
            url: `/segments/${existingSegment.id}`,
            payload: {
                startMilliseconds: existingSegment.endMilliseconds,
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
});

describe("DELETE /segments/:segmentId", () => {
    it("deletes an existing segment", async () => {
        const segment = await prisma.segment.create({
            data: {
                videoId: "sample-video-1",
                name: "Segment to delete",
                startMilliseconds: 200000,
                endMilliseconds: 210000,
                tags: [],
            },
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/segments/${segment.id}`,
        });

        expect(response.statusCode).toBe(204);

        const deletedSegment = await prisma.segment.findUnique({
            where: {
                id: segment.id,
            },
        });

        expect(deletedSegment).toBeNull();
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
    });
});

describe("GET /practice-queue", () => {
    it("selects weak or high-priority segments in practice order", async () => {
        await prisma.segment.updateMany({
            data: {
                confidence: "high",
                practicePriority: "low",
            },
        });

        await prisma.segment.createMany({
            data: [
                {
                    id: "queue-high-low",
                    videoId: "sample-video-1",
                    name: "Queue high priority and low confidence",
                    startMilliseconds: 300000,
                    endMilliseconds: 310000,
                    tags: ["practice-queue-test"],
                    confidence: "low",
                    practicePriority: "high",
                },
                {
                    id: "queue-high-high",
                    videoId: "sample-video-1",
                    name: "Queue high priority and high confidence",
                    startMilliseconds: 320000,
                    endMilliseconds: 330000,
                    tags: ["practice-queue-test"],
                    confidence: "high",
                    practicePriority: "high",
                },
                {
                    id: "queue-medium-low",
                    videoId: "sample-video-1",
                    name: "Queue medium priority and low confidence",
                    startMilliseconds: 340000,
                    endMilliseconds: 350000,
                    tags: ["practice-queue-test"],
                    confidence: "low",
                    practicePriority: "medium",
                },
                {
                    id: "queue-medium-medium",
                    videoId: "sample-video-1",
                    name: "Not queued medium segment",
                    startMilliseconds: 360000,
                    endMilliseconds: 370000,
                    tags: ["practice-queue-test"],
                    confidence: "medium",
                    practicePriority: "medium",
                },
                {
                    id: "queue-low-high",
                    videoId: "sample-video-1",
                    name: "Not queued low-priority segment",
                    startMilliseconds: 380000,
                    endMilliseconds: 390000,
                    tags: ["practice-queue-test"],
                    confidence: "high",
                    practicePriority: "low",
                },
            ],
        });

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
        await createOtherUserTestData();

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

        const storedSegment = await prisma.segment.findFirst({
            where: {
                name: "Unauthorized segment",
            },
        });

        expect(storedSegment).toBeNull();
    });

    it("returns 404 when reading another user's segment", async () => {
        await createOtherUserTestData();

        const response = await app.inject({
            method: "GET",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("excludes another user's segments from collections", async () => {
        await createOtherUserTestData();

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
        await createOtherUserTestData();

        const response = await app.inject({
            method: "PATCH",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}`,
            payload: {
                name: "Unauthorized update",
            },
        });

        expect(response.statusCode).toBe(404);

        const storedSegment = await prisma.segment.findUniqueOrThrow({
            where: {
                id: OTHER_TEST_SEGMENT_ID,
            },
        });

        expect(storedSegment.name).toBe(
            "Another user's weak segment"
        );
    });

    it("does not delete another user's segment", async () => {
        await createOtherUserTestData();

        const response = await app.inject({
            method: "DELETE",
            url: `/segments/${OTHER_TEST_SEGMENT_ID}`,
        });

        expect(response.statusCode).toBe(404);

        const storedSegment = await prisma.segment.findUnique({
            where: {
                id: OTHER_TEST_SEGMENT_ID,
            },
        });

        expect(storedSegment).not.toBeNull();
    });
});
