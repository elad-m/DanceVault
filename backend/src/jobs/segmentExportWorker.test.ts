import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import { processSegmentExportJob } from "./segmentExportWorker";

const job = {
    schemaVersion: 1 as const,
    exportID: "export-1",
    userID: "user-1",
    segmentID: "segment-1",
    sourceStorageKey: "users/user-1/videos/video-1.mov",
    outputStorageKey:
        "users/user-1/exports/segments/segment-1/export-1.mp4",
    startMilliseconds: 1_000,
    endMilliseconds: 11_000,
};

function createDataAccess() {
    return {
        createSegmentExport: vi.fn(),
        getSegmentExport: vi.fn<
            SegmentExportDataAccess["getSegmentExport"]
        >(async () => ({
            id: job.exportID,
            segmentId: job.segmentID,
            videoId: "video-1",
            sourceStorageKey: job.sourceStorageKey,
            outputStorageKey: job.outputStorageKey,
            startMilliseconds: job.startMilliseconds,
            endMilliseconds: job.endMilliseconds,
            status: "queued" as const,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        })),
        markSegmentExportProcessing: vi.fn(async () => undefined),
        markSegmentExportReady: vi.fn(async () => undefined),
        markSegmentExportFailed: vi.fn(async () => undefined),
        deleteSegmentExport: vi.fn(async () => undefined),
    } satisfies SegmentExportDataAccess;
}

describe("processSegmentExportJob", () => {
    it("uploads output and marks the export ready", async () => {
        const dataAccess = createDataAccess();
        const upload = vi.fn(async () => undefined);

        await processSegmentExportJob({
            job,
            segmentExportDataAccess: dataAccess,
            segmentExportStorageProvider: {
                async downloadSourceVideoToFile(_key, path) {
                    await writeFile(path, "source");
                },
                uploadSegmentExportFromFile: upload,
                async createSegmentExportDownloadUrl() { return "unused"; },
                async deleteSegmentExportObject() {},
                close() {},
            },
            segmentExportProcessor: {
                async process({ outputPath }) {
                    await writeFile(outputPath, "exported video");
                },
            },
        });

        expect(upload).toHaveBeenCalledWith(
            job.outputStorageKey,
            expect.any(String)
        );
        expect(dataAccess.markSegmentExportReady).toHaveBeenCalledWith(
            expect.objectContaining({
                exportID: job.exportID,
                outputSizeBytes: 14,
            })
        );
        expect(dataAccess.markSegmentExportFailed).not.toHaveBeenCalled();
    });

    it("removes partial output and propagates failures for retry", async () => {
        const dataAccess = createDataAccess();
        const deleteOutput = vi.fn(async () => undefined);

        await expect(
            processSegmentExportJob({
                job,
                segmentExportDataAccess: dataAccess,
                segmentExportStorageProvider: {
                    async downloadSourceVideoToFile() {
                        throw new Error("Source unavailable");
                    },
                    async uploadSegmentExportFromFile() {},
                    async createSegmentExportDownloadUrl() { return "unused"; },
                    deleteSegmentExportObject: deleteOutput,
                    close() {},
                },
                segmentExportProcessor: { async process() {} },
            })
        ).rejects.toThrow("Source unavailable");

        expect(deleteOutput).toHaveBeenCalledWith(job.outputStorageKey);
        expect(dataAccess.markSegmentExportFailed).not.toHaveBeenCalled();
        expect(dataAccess.markSegmentExportReady).not.toHaveBeenCalled();
    });

    it("does not repeat work for an already-ready duplicate job", async () => {
        const dataAccess = createDataAccess();
        dataAccess.getSegmentExport.mockResolvedValueOnce({
            id: job.exportID,
            segmentId: job.segmentID,
            videoId: "video-1",
            sourceStorageKey: job.sourceStorageKey,
            outputStorageKey: job.outputStorageKey,
            startMilliseconds: job.startMilliseconds,
            endMilliseconds: job.endMilliseconds,
            status: "ready",
            outputSizeBytes: 123,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        });
        const download = vi.fn();

        await processSegmentExportJob({
            job,
            segmentExportDataAccess: dataAccess,
            segmentExportStorageProvider: {
                downloadSourceVideoToFile: download,
                async uploadSegmentExportFromFile() {},
                async createSegmentExportDownloadUrl() { return "unused"; },
                async deleteSegmentExportObject() {},
                close() {},
            },
            segmentExportProcessor: { async process() {} },
        });

        expect(download).not.toHaveBeenCalled();
        expect(dataAccess.markSegmentExportProcessing).not.toHaveBeenCalled();
    });
});
