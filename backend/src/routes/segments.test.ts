import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../db";
import {
    clearTestDatabase,
    registerTestAuthentication,
    resetTestDatabase,
    TEST_USER_ID,
} from "../test/testDatabase";

const app = buildApp();
registerTestAuthentication(app);

beforeEach(async () => {
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
                startSeconds: 500,
                endSeconds: 530,
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
            startSeconds: 500,
            endSeconds: 530,
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
                startSeconds: 10,
                endSeconds: 20,
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
                startSeconds: 30,
                endSeconds: 20,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: {
                code: "INVALID_SEGMENT_TIMESTAMPS",
                message: "endSeconds must be greater than startSeconds",
            },
        });
    });

    it("rejects an unsupported difficulty value", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos/sample-video-1/segments",
            payload: {
                name: "Invalid difficulty segment",
                startSeconds: 70,
                endSeconds: 80,
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
                startSeconds: 90,
                endSeconds: 100,
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
                startSeconds: 110,
                endSeconds: 120,
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
                startSeconds: -1,
                endSeconds: 10,
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
                startSeconds: "five",
                endSeconds: 10,
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
                startSeconds: 130,
                endSeconds: 140,
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
                startSeconds: 150,
                endSeconds: 160,
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
                startSeconds: 170,
                endSeconds: 180,
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
                            startSeconds: 10,
                            endSeconds: 20,
                            tags: ["pagination-test"],
                        },
                        {
                            name: "Pagination segment 2",
                            startSeconds: 30,
                            endSeconds: 40,
                            tags: ["pagination-test"],
                        },
                        {
                            name: "Pagination segment 3",
                            startSeconds: 50,
                            endSeconds: 60,
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
                startSeconds: 12,
                endSeconds: 24,
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
            startSeconds: 12,
            endSeconds: 24,
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
        expect(savedSegment.startSeconds).toBe(12);
        expect(savedSegment.endSeconds).toBe(24);
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
                startSeconds: existingSegment.endSeconds,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: {
                code: "INVALID_SEGMENT_TIMESTAMPS",
                message: "endSeconds must be greater than startSeconds",
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
                startSeconds: 200,
                endSeconds: 210,
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
                    startSeconds: 300,
                    endSeconds: 310,
                    tags: ["practice-queue-test"],
                    confidence: "low",
                    practicePriority: "high",
                },
                {
                    id: "queue-high-high",
                    videoId: "sample-video-1",
                    name: "Queue high priority and high confidence",
                    startSeconds: 320,
                    endSeconds: 330,
                    tags: ["practice-queue-test"],
                    confidence: "high",
                    practicePriority: "high",
                },
                {
                    id: "queue-medium-low",
                    videoId: "sample-video-1",
                    name: "Queue medium priority and low confidence",
                    startSeconds: 340,
                    endSeconds: 350,
                    tags: ["practice-queue-test"],
                    confidence: "low",
                    practicePriority: "medium",
                },
                {
                    id: "queue-medium-medium",
                    videoId: "sample-video-1",
                    name: "Not queued medium segment",
                    startSeconds: 360,
                    endSeconds: 370,
                    tags: ["practice-queue-test"],
                    confidence: "medium",
                    practicePriority: "medium",
                },
                {
                    id: "queue-low-high",
                    videoId: "sample-video-1",
                    name: "Not queued low-priority segment",
                    startSeconds: 380,
                    endSeconds: 390,
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

