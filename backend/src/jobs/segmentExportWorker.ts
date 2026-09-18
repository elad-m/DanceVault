import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { SegmentExportProcessor } from "../media/segmentExportProcessor";
import { segmentExportRetentionMilliseconds } from "../domain/segmentExport";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";
import type { SegmentExportJob } from "./segmentExportQueue";

type ProcessSegmentExportJobInput = {
    job: SegmentExportJob;
    segmentExportDataAccess: SegmentExportDataAccess;
    segmentExportStorageProvider: SegmentExportStorageProvider;
    segmentExportProcessor: SegmentExportProcessor;
};

export async function processSegmentExportJob({
    job,
    segmentExportDataAccess,
    segmentExportStorageProvider,
    segmentExportProcessor,
}: ProcessSegmentExportJobInput): Promise<void> {
    const exportItem =
        await segmentExportDataAccess.getSegmentExport({
            userID: job.userID,
            segmentID: job.segmentID,
        });

    if (
        !exportItem ||
        exportItem.id !== job.exportID ||
        exportItem.status === "failed" ||
        exportItem.status === "ready"
    ) {
        return;
    }

    const directory = await mkdtemp(
        join(tmpdir(), "dancevault-segment-export-")
    );
    const sourceExtension = extname(job.sourceStorageKey) || ".video";
    const sourcePath = join(directory, `source${sourceExtension}`);
    const outputPath = join(directory, "output.mp4");

    try {
        await segmentExportDataAccess.markSegmentExportProcessing({
            userID: job.userID,
            segmentID: job.segmentID,
            exportID: job.exportID,
            updatedAt: new Date(),
        });
        await segmentExportStorageProvider.downloadSourceVideoToFile(
            job.sourceStorageKey,
            sourcePath
        );
        await segmentExportProcessor.process({
            sourcePath,
            outputPath,
            startMilliseconds: job.startMilliseconds,
            endMilliseconds: job.endMilliseconds,
        });
        const output = await stat(outputPath);

        if (output.size === 0) {
            throw new Error("FFmpeg produced an empty segment export");
        }

        await segmentExportStorageProvider.uploadSegmentExportFromFile(
            job.outputStorageKey,
            outputPath
        );
        const completedAt = new Date();
        await segmentExportDataAccess.markSegmentExportReady({
            userID: job.userID,
            segmentID: job.segmentID,
            exportID: job.exportID,
            outputSizeBytes: output.size,
            updatedAt: completedAt,
            expiresAt: new Date(
                completedAt.getTime() +
                    segmentExportRetentionMilliseconds
            ),
        });
    } catch (error: unknown) {
        await segmentExportStorageProvider
            .deleteSegmentExportObject(job.outputStorageKey)
            .catch(() => undefined);
        throw error;
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
