import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../db";
import {
    clearTestDatabase,
    registerTestAuthentication,
    resetTestDatabase,
    TEST_USER_ID,
    createOtherUserTestData,
    OTHER_TEST_VIDEO_ID,
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
            userId: TEST_USER_ID,
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

    it("rejects uploaded files because they use the upload route", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/videos",
            payload: {
                title: "Uploaded lesson",
                sourceType: "uploaded",
                sourceUrl: "not-used-for-uploads",
            },
        });

        expect(response.statusCode).toBe(400);
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
        expect(response.json()).toMatchObject({
            userId: TEST_USER_ID,
            title: "Uploaded salsa lesson",
            sourceType: "uploaded",
            sourceUrl: null,
            status: "pending_upload",
            originalFileName: "lesson.mp4",
            storageKey: expect.stringMatching(
                /^users\/test-user-1\/videos\/[0-9a-f-]+\.mp4$/
            ),
        });

        const storedVideo = await prisma.video.findUniqueOrThrow({
            where: {
                id: response.json().id,
            },
        });

        expect(storedVideo.status).toBe("pending_upload");
        expect(storedVideo.sourceUrl).toBeNull();
        expect(storedVideo.originalFileName).toBe("lesson.mp4");
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
    it("updates the video title", async () => {
        const video = await prisma.video.create({
            data: {
                title: "Video before update",
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=before-update",
                user: {
                    connect: {
                        id: TEST_USER_ID,
                    },
                },
            },
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
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=before-update",
        });

        const savedVideo = await prisma.video.findUniqueOrThrow({
            where: {
                id: video.id,
            },
        });

        expect(savedVideo.title).toBe("Updated test lesson");
    });

    it("rejects source changes outside their dedicated workflow", async () => {
        const response = await app.inject({
            method: "PATCH",
            url: "/videos/sample-video-1",
            payload: {
                sourceUrl: "https://example.com/replacement",
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
    it("deletes a video and its segments", async () => {
        const video = await prisma.video.create({
            data: {
                title: "Video to delete",
                sourceType: "external_url",
                sourceUrl: "https://example.com/video-to-delete",
                user: {
                    connect: {
                        id: TEST_USER_ID,
                    },
                },
                segments: {
                    create: {
                        name: "Dependent segment",
                        startMilliseconds: 10000,
                        endMilliseconds: 20000,
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

describe("Video ownership", () => {
    it("does not list another user's video", async () => {
        await createOtherUserTestData();

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
        await createOtherUserTestData();

        const response = await app.inject({
            method: "GET",
            url: `/videos/${OTHER_TEST_VIDEO_ID}`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("does not update another user's video", async () => {
        await createOtherUserTestData();

        const response = await app.inject({
            method: "PATCH",
            url: `/videos/${OTHER_TEST_VIDEO_ID}`,
            payload: {
                title: "Unauthorized update",
            },
        });

        expect(response.statusCode).toBe(404);

        const storedVideo = await prisma.video.findUniqueOrThrow({
            where: {
                id: OTHER_TEST_VIDEO_ID,
            },
        });

        expect(storedVideo.title).toBe("Another user's lesson");
    });

    it("does not delete another user's video", async () => {
        await createOtherUserTestData();

        const response = await app.inject({
            method: "DELETE",
            url: `/videos/${OTHER_TEST_VIDEO_ID}`,
        });

        expect(response.statusCode).toBe(404);

        const storedVideo = await prisma.video.findUnique({
            where: {
                id: OTHER_TEST_VIDEO_ID,
            },
        });

        expect(storedVideo).not.toBeNull();
    });

    it("does not return segments from another user's video", async () => {
        await createOtherUserTestData();

        const response = await app.inject({
            method: "GET",
            url: `/videos/${OTHER_TEST_VIDEO_ID}/segments`,
        });

        expect(response.statusCode).toBe(404);
    });
});
