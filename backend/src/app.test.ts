import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { prisma } from "./db";

const app = buildApp();

beforeAll(async () => {
    await prisma.segment.deleteMany();
    await prisma.video.deleteMany();

    await prisma.video.create({
        data: {
            id: "sample-video-1",
            title: "Test lesson summary",
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=test-video",
            segments: {
                create: [
                    {
                        name: "Open stance wave",
                        startSeconds: 10,
                        endSeconds: 20,
                        tags: ["wave"],
                        difficulty: "medium",
                        confidence: "low",
                        practicePriority: "high",
                    },
                    {
                        name: "Closed stance wave",
                        startSeconds: 30,
                        endSeconds: 40,
                        tags: ["wave"],
                        difficulty: "hard",
                        confidence: "medium",
                        practicePriority: "medium",
                    },
                    {
                        name: "Basic step",
                        startSeconds: 50,
                        endSeconds: 60,
                        tags: ["basic"],
                        difficulty: "easy",
                        confidence: "high",
                        practicePriority: "low",
                    },
                ],
            },
        },
    });
});

afterAll(async () => {
    await prisma.segment.deleteMany();
    await prisma.video.deleteMany();
    await app.close();
    await prisma.$disconnect();
});

// Health route

describe("GET /health", () => {
    it("returns an ok status", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: "ok",
        });
    });
});

// Video routes

describe("POST /videos", () => {
    it("creates a video", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos",
            payload: {
                title: "Bachata lesson summary",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=test123",
            },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
            title: "Bachata lesson summary",
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=test123",
        });
    });

    it("rejects a video with missing required fields", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos",
            payload: {
                title: "Incomplete lesson",
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            error: {
                code: "VALIDATION_ERROR",
            },
        });
    });

    it("rejects an empty video title", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos",
            payload: {
                title: "",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=test123",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects video fields with the wrong type", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos",
            payload: {
                title: "Bachata lesson summary",
                sourceType: 42,
                sourceUrl: "https://youtube.com/watch?v=test123",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("rejects unexpected video properties", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos",
            payload: {
                title: "Bachata lesson summary",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=test123",
                admin: true,
            },
        });

        expect(response.statusCode).toBe(400);
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
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=test-video",
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
    it("returns the video's segments with playback URLs", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos/sample-video-1/segments",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().segments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "Open stance wave",
                    playbackUrl:
                        "https://youtube.com/watch?v=test-video&t=10s",
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
    it("updates editable video properties", async () => {
        const video = await prisma.video.create({
            data: {
                title: "Video before update",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=before-update",
            },
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/videos/${video.id}`,
            payload: {
                title: "Updated test lesson",
                sourceType: "external_url",
                sourceUrl: "https://example.com/updated-video",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: video.id,
            title: "Updated test lesson",
            sourceType: "external_url",
            sourceUrl: "https://example.com/updated-video",
        });

        const savedVideo = await prisma.video.findUniqueOrThrow({
            where: {
                id: video.id,
            },
        });

        expect(savedVideo.title).toBe("Updated test lesson");
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
    it("deletes a video and its segments", async () => {
        const video = await prisma.video.create({
            data: {
                title: "Video to delete",
                sourceType: "external_url",
                sourceUrl: "https://example.com/video-to-delete",
                segments: {
                    create: {
                        name: "Dependent segment",
                        startSeconds: 10,
                        endSeconds: 20,
                        tags: [],
                    },
                },
            },
            include: {
                segments: true,
            },
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${video.id}`,
        });

        expect(response.statusCode).toBe(204);
        expect(response.body).toBe("");

        const deletedVideo = await prisma.video.findUnique({
            where: {
                id: video.id,
            },
        });
        const deletedSegment = await prisma.segment.findUnique({
            where: {
                id: video.segments[0].id,
            },
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
