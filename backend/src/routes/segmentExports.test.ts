import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SegmentExportDataAccessItem } from "../persistence/segmentExportDataAccess";
import { TEST_USER_ID } from "../test/routeTestSupport";
import { registerSegmentExportRoutes } from "./segmentExports";

const readyExport: SegmentExportDataAccessItem = {
    id: "export-1",
    segmentId: "segment-1",
    videoId: "video-1",
    sourceStorageKey: "users/test-user-1/videos/video-1.mov",
    outputStorageKey:
        "users/test-user-1/exports/segments/segment-1/export-1.mp4",
    startMilliseconds: 1_000,
    endMilliseconds: 11_000,
    status: "ready",
    outputSizeBytes: 123,
    expiresAt: new Date("2026-09-23T12:00:00.000Z"),
    createdAt: new Date("2026-09-16T12:00:00.000Z"),
    updatedAt: new Date("2026-09-16T12:01:00.000Z"),
};

function createTestApp(options: {
    exportItem?: SegmentExportDataAccessItem | null;
} = {}) {
    const app = Fastify();
    const enqueue = vi.fn(async () => undefined);
    const getSegmentExport = vi.fn(async () =>
        options.exportItem === undefined ? readyExport : options.exportItem
    );
    const createSegmentExportDownloadUrl = vi.fn(async () =>
        "http://127.0.0.1:9000/signed-export"
    );

    app.addHook("onRequest", async (request) => {
        request.userId = TEST_USER_ID;
    });
    registerSegmentExportRoutes(app, {
        segmentDataAccess: {
            async createSegment() { throw new Error("unused"); },
            async getSegmentByID() {
                return {
                    id: "segment-1",
                    videoId: "video-1",
                    name: "Turn",
                    description: null,
                    startMilliseconds: 1_000,
                    endMilliseconds: 11_000,
                    tags: [],
                    difficulty: "medium",
                    confidence: "medium",
                    practicePriority: "medium",
                    createdAt: new Date("2026-09-16T11:00:00.000Z"),
                };
            },
            async listSegmentsByVideo() { throw new Error("unused"); },
            async listSegments() { throw new Error("unused"); },
            async updateSegmentMetadata() { throw new Error("unused"); },
            async deleteSegment() { throw new Error("unused"); },
        },
        videoDataAccess: {
            async createVideo() { throw new Error("unused"); },
            async getVideoByID(input) {
                expect(input.userID).toBe(TEST_USER_ID);
                return {
                    id: "video-1",
                    userId: TEST_USER_ID,
                    environment: "local",
                    title: "Lesson",
                    storageKey:
                        "users/test-user-1/videos/video-1.mov",
                    storageProvider: "minio",
                    originalFileName: "lesson.mov",
                    fileSizeBytes: 100,
                    status: "ready",
                    createdAt: new Date("2026-09-16T10:00:00.000Z"),
                };
            },
            async listVideos() { throw new Error("unused"); },
            async listAllVideosForStorageAudit() { throw new Error("unused"); },
            async updateVideoStatus() { throw new Error("unused"); },
            async finalizeVideoUpload() { throw new Error("unused"); },
            async markVideoUploadFailed() { throw new Error("unused"); },
            async markVideoDeleting() { throw new Error("unused"); },
            async updateVideoTitle() { throw new Error("unused"); },
            async deleteVideo() { throw new Error("unused"); },
        },
        segmentExportDataAccess: {
            async createSegmentExport(input) {
                expect(input.userID).toBe(TEST_USER_ID);
                return {
                    kind: "created",
                    export: {
                        ...readyExport,
                        id: input.exportID,
                        status: "queued",
                    },
                };
            },
            getSegmentExport,
            async markSegmentExportProcessing() {},
            async markSegmentExportReady() {},
            async markSegmentExportFailed() {},
            async deleteSegmentExport() {},
        },
        segmentExportQueue: { enqueue, close() {} },
        segmentExportStorageProvider: {
            async downloadSourceVideoToFile() {},
            async uploadSegmentExportFromFile() {},
            createSegmentExportDownloadUrl,
            async deleteSegmentExportObject() {},
            close() {},
        },
    });

    return {
        app,
        enqueue,
        getSegmentExport,
        createSegmentExportDownloadUrl,
    };
}

const apps: ReturnType<typeof createTestApp>["app"][] = [];

afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("segment export routes", () => {
    it("creates an export for the authenticated user's segment", async () => {
        const context = createTestApp();
        apps.push(context.app);

        const response = await context.app.inject({
            method: "POST",
            url: "/segments/segment-1/export",
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toMatchObject({
            segmentId: "segment-1",
            status: "queued",
        });
        expect(context.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                userID: TEST_USER_ID,
                segmentID: "segment-1",
            })
        );
    });

    it("returns export status without exposing its storage key", async () => {
        const context = createTestApp();
        apps.push(context.app);

        const response = await context.app.inject(
            "/segments/segment-1/export"
        );

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            id: "export-1",
            segmentId: "segment-1",
            videoId: "video-1",
            status: "ready",
            failureMessage: null,
            outputSizeBytes: 123,
            createdAt: "2026-09-16T12:00:00.000Z",
            updatedAt: "2026-09-16T12:01:00.000Z",
        });
        expect(context.getSegmentExport).toHaveBeenCalledWith({
            userID: TEST_USER_ID,
            segmentID: "segment-1",
        });
    });

    it("creates a download URL only for a ready export", async () => {
        const context = createTestApp();
        apps.push(context.app);

        const response = await context.app.inject(
            "/segments/segment-1/export/download-url"
        );

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            downloadUrl: "http://127.0.0.1:9000/signed-export",
            expiresInSeconds: 900,
        });
        expect(
            context.createSegmentExportDownloadUrl
        ).toHaveBeenCalledWith(readyExport.outputStorageKey);
    });

    it("does not create a download URL while processing", async () => {
        const context = createTestApp({
            exportItem: { ...readyExport, status: "processing" },
        });
        apps.push(context.app);

        const response = await context.app.inject(
            "/segments/segment-1/export/download-url"
        );

        expect(response.statusCode).toBe(409);
        expect(context.createSegmentExportDownloadUrl).not.toHaveBeenCalled();
    });
});
