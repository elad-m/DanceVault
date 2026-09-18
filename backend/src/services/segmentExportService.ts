import { randomUUID } from "node:crypto";
import {
    createSegmentExportStorageKey,
    validateSegmentExportDuration,
} from "../domain/segmentExport";
import type { SegmentExportQueue } from "../jobs/segmentExportQueue";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import type {
    SegmentExportDataAccess,
    SegmentExportDataAccessItem,
} from "../persistence/segmentExportDataAccess";
import type { VideoDataAccess } from "../persistence/videoDataAccess";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";

type RequestSegmentExportInput = {
    userID: string;
    segmentID: string;
    segmentDataAccess: SegmentDataAccess;
    videoDataAccess: VideoDataAccess;
    segmentExportDataAccess: SegmentExportDataAccess;
    segmentExportQueue: SegmentExportQueue;
};

export type RequestSegmentExportResult =
    | { kind: "not_found" }
    | { kind: "video_not_ready" }
    | { kind: "too_long" }
    | { kind: "busy" }
    | {
          kind: "created" | "existing";
          export: SegmentExportDataAccessItem;
      };

export async function requestSegmentExport(
    input: RequestSegmentExportInput
): Promise<RequestSegmentExportResult> {
    const segment = await input.segmentDataAccess.getSegmentByID({
        userID: input.userID,
        segmentID: input.segmentID,
    });

    if (!segment) return { kind: "not_found" };

    const video = await input.videoDataAccess.getVideoByID({
        userID: input.userID,
        videoID: segment.videoId,
    });

    if (!video) return { kind: "not_found" };
    if (video.status !== "ready") return { kind: "video_not_ready" };

    try {
        validateSegmentExportDuration({
            startMilliseconds: segment.startMilliseconds,
            endMilliseconds: segment.endMilliseconds,
        });
    } catch {
        return { kind: "too_long" };
    }

    const exportID = randomUUID();
    const outputStorageKey = createSegmentExportStorageKey({
        userID: input.userID,
        segmentID: segment.id,
        exportID,
    });
    const result = await input.segmentExportDataAccess.createSegmentExport({
        exportID,
        userID: input.userID,
        segmentID: segment.id,
        videoID: video.id,
        sourceStorageKey: video.storageKey,
        outputStorageKey,
        startMilliseconds: segment.startMilliseconds,
        endMilliseconds: segment.endMilliseconds,
        createdAt: new Date(),
    });

    if (result.kind === "busy") return result;

    if (result.kind === "created") {
        try {
            await input.segmentExportQueue.enqueue({
                schemaVersion: 1,
                exportID,
                userID: input.userID,
                segmentID: segment.id,
                sourceStorageKey: video.storageKey,
                outputStorageKey,
                startMilliseconds: segment.startMilliseconds,
                endMilliseconds: segment.endMilliseconds,
            });
        } catch (error: unknown) {
            await input.segmentExportDataAccess.markSegmentExportFailed({
                userID: input.userID,
                segmentID: segment.id,
                exportID,
                failureMessage:
                    error instanceof Error
                        ? error.message.slice(0, 500)
                        : "Segment export could not be queued",
                updatedAt: new Date(),
            });
            throw error;
        }
    }

    return result;
}

export async function getSegmentExport(input: {
    userID: string;
    segmentID: string;
    segmentExportDataAccess: SegmentExportDataAccess;
}) {
    const exportItem = await input.segmentExportDataAccess.getSegmentExport({
        userID: input.userID,
        segmentID: input.segmentID,
    });

    if (
        exportItem?.expiresAt &&
        exportItem.expiresAt.getTime() <= Date.now()
    ) {
        return null;
    }

    return exportItem;
}

export async function deleteSegmentExport(input: {
    userID: string;
    segmentID: string;
    segmentExportDataAccess: SegmentExportDataAccess;
    segmentExportStorageProvider: SegmentExportStorageProvider;
}): Promise<void> {
    const exportItem =
        await input.segmentExportDataAccess.getSegmentExport({
            userID: input.userID,
            segmentID: input.segmentID,
        });

    if (!exportItem) return;

    await input.segmentExportStorageProvider.deleteSegmentExportObject(
        exportItem.outputStorageKey
    );
    await input.segmentExportDataAccess.deleteSegmentExport({
        userID: input.userID,
        segmentID: input.segmentID,
        exportID: exportItem.id,
    });
}

export async function getSegmentExportDownloadUrl(input: {
    userID: string;
    segmentID: string;
    segmentExportDataAccess: SegmentExportDataAccess;
    segmentExportStorageProvider: SegmentExportStorageProvider;
}) {
    const exportItem = await getSegmentExport(input);

    if (!exportItem) return { kind: "not_found" as const };
    if (exportItem.status !== "ready") {
        return { kind: "not_ready" as const, export: exportItem };
    }

    return {
        kind: "ready" as const,
        downloadUrl:
            await input.segmentExportStorageProvider.createSegmentExportDownloadUrl(
                exportItem.outputStorageKey
            ),
    };
}
