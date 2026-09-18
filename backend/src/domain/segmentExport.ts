export const maxSegmentExportDurationMilliseconds = 30_000;
export const segmentExportRetentionMilliseconds =
    7 * 24 * 60 * 60 * 1_000;
export const segmentExportJobLeaseMilliseconds =
    15 * 24 * 60 * 60 * 1_000;

export type SegmentExportStatus =
    | "queued"
    | "processing"
    | "ready"
    | "failed";

export function createSegmentExportStorageKey(input: {
    userID: string;
    segmentID: string;
    exportID: string;
}): string {
    return [
        "users",
        encodeURIComponent(input.userID),
        "exports",
        "segments",
        encodeURIComponent(input.segmentID),
        `${encodeURIComponent(input.exportID)}.mp4`,
    ].join("/");
}

export function validateSegmentExportDuration(input: {
    startMilliseconds: number;
    endMilliseconds: number;
}): void {
    const durationMilliseconds =
        input.endMilliseconds - input.startMilliseconds;

    if (
        durationMilliseconds <= 0 ||
        durationMilliseconds > maxSegmentExportDurationMilliseconds
    ) {
        throw new Error(
            "Segment exports must be longer than zero and no longer than 30 seconds"
        );
    }
}
