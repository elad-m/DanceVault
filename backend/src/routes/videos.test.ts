import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../db";
import {
    clearTestDatabase,
    resetTestDatabase,
} from "../test/testDatabase";

const app = buildApp();

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

