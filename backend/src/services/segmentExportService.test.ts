import { describe, expect, it, vi } from "vitest";
import type { SegmentDataAccessItem } from "../persistence/segmentDataAccess";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import type { VideoDataAccessItem } from "../persistence/videoDataAccess";
import {
    deleteSegmentExport,
    getSegmentExport,
    requestSegmentExport,
} from "./segmentExportService";

const segment: SegmentDataAccessItem = {
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
    createdAt: new Date("2026-09-16T08:00:00.000Z"),
};

const video: VideoDataAccessItem = {
    id: "video-1",
    userId: "user-1",
    environment: "local",
    title: "Lesson",
    storageKey: "users/user-1/videos/video-1.mov",
    storageProvider: "minio",
    originalFileName: "lesson.mov",
    fileSizeBytes: 100,
    status: "ready",
    createdAt: new Date("2026-09-16T07:00:00.000Z"),
};

function createContext(segmentOverride: Partial<SegmentDataAccessItem> = {}) {
    const enqueue = vi.fn(async () => undefined);
    const createdExport = {
        id: "export-1",
        segmentId: segment.id,
        videoId: video.id,
        sourceStorageKey: video.storageKey,
        outputStorageKey:
            "users/user-1/exports/segments/segment-1/export-1.mp4",
        startMilliseconds: segment.startMilliseconds,
        endMilliseconds: segment.endMilliseconds,
        status: "queued" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const segmentExportDataAccess = {
        createSegmentExport: vi.fn(async () => ({
            kind: "created" as const,
            export: createdExport,
        })),
        getSegmentExport: vi.fn(),
        markSegmentExportProcessing: vi.fn(),
        markSegmentExportReady: vi.fn(),
        markSegmentExportFailed: vi.fn(),
        deleteSegmentExport: vi.fn(),
    } satisfies SegmentExportDataAccess;

    return {
        input: {
            userID: "user-1",
            segmentID: segment.id,
            segmentDataAccess: {
                async getSegmentByID() {
                    return { ...segment, ...segmentOverride };
                },
            } as never,
            videoDataAccess: {
                async getVideoByID() {
                    return video;
                },
            } as never,
            segmentExportDataAccess,
            segmentExportQueue: { enqueue, close() {} },
        },
        enqueue,
        segmentExportDataAccess,
    };
}

describe("requestSegmentExport", () => {
    it("creates and queues a snapshot of the selected segment", async () => {
        const context = createContext();

        const result = await requestSegmentExport(context.input);

        expect(result.kind).toBe("created");
        expect(context.segmentExportDataAccess.createSegmentExport)
            .toHaveBeenCalledWith(expect.objectContaining({
                userID: "user-1",
                segmentID: "segment-1",
                videoID: "video-1",
                startMilliseconds: 1_000,
                endMilliseconds: 11_000,
            }));
        expect(context.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                userID: "user-1",
                segmentID: "segment-1",
                sourceStorageKey: video.storageKey,
            })
        );
    });

    it("rejects a segment longer than 30 seconds before persistence", async () => {
        const context = createContext({ endMilliseconds: 31_001 });

        await expect(requestSegmentExport(context.input)).resolves.toEqual({
            kind: "too_long",
        });
        expect(
            context.segmentExportDataAccess.createSegmentExport
        ).not.toHaveBeenCalled();
        expect(context.enqueue).not.toHaveBeenCalled();
    });
});

describe("segment export lifecycle", () => {
    it("does not expose an expired export", async () => {
        const context = createContext();
        context.segmentExportDataAccess.getSegmentExport.mockResolvedValue({
            id: "export-1",
            segmentId: segment.id,
            videoId: video.id,
            sourceStorageKey: video.storageKey,
            outputStorageKey:
                "users/user-1/exports/segments/segment-1/export-1.mp4",
            startMilliseconds: 1_000,
            endMilliseconds: 11_000,
            status: "ready",
            outputSizeBytes: 123,
            expiresAt: new Date(Date.now() - 1_000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(
            getSegmentExport({
                userID: "user-1",
                segmentID: segment.id,
                segmentExportDataAccess:
                    context.segmentExportDataAccess,
            })
        ).resolves.toBeNull();
    });

    it("deletes the stored object before its export record", async () => {
        const context = createContext();
        const events: string[] = [];
        context.segmentExportDataAccess.getSegmentExport.mockResolvedValue({
            id: "export-1",
            segmentId: segment.id,
            videoId: video.id,
            sourceStorageKey: video.storageKey,
            outputStorageKey:
                "users/user-1/exports/segments/segment-1/export-1.mp4",
            startMilliseconds: 1_000,
            endMilliseconds: 11_000,
            status: "ready",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        context.segmentExportDataAccess.deleteSegmentExport
            .mockImplementation(async () => {
                events.push("record");
            });

        await deleteSegmentExport({
            userID: "user-1",
            segmentID: segment.id,
            segmentExportDataAccess:
                context.segmentExportDataAccess,
            segmentExportStorageProvider: {
                async downloadSourceVideoToFile() {},
                async uploadSegmentExportFromFile() {},
                async createSegmentExportDownloadUrl() { return "unused"; },
                async deleteSegmentExportObject() {
                    events.push("object");
                },
                close() {},
            },
        });

        expect(events).toEqual(["object", "record"]);
    });
});
