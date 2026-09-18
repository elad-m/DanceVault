export const CURRENT_SEGMENT_EXPORT_JOB_SCHEMA_VERSION = 1 as const;

export type SegmentExportJob = {
    schemaVersion: typeof CURRENT_SEGMENT_EXPORT_JOB_SCHEMA_VERSION;
    exportID: string;
    userID: string;
    segmentID: string;
    sourceStorageKey: string;
    outputStorageKey: string;
    startMilliseconds: number;
    endMilliseconds: number;
};

export type SegmentExportQueue = {
    enqueue(job: SegmentExportJob): Promise<void>;
    close(): void;
};

export function parseSegmentExportJob(
    messageBody: string
): SegmentExportJob {
    try {
        const value: unknown = JSON.parse(messageBody);

        if (!isSegmentExportJob(value)) {
            throw new Error();
        }

        return value;
    } catch {
        throw new Error("Invalid segment export job");
    }
}

function isSegmentExportJob(value: unknown): value is SegmentExportJob {
    if (typeof value !== "object" || value === null) return false;

    const candidate = value as Record<string, unknown>;
    return (
        candidate.schemaVersion ===
            CURRENT_SEGMENT_EXPORT_JOB_SCHEMA_VERSION &&
        isNonEmptyString(candidate.exportID) &&
        isNonEmptyString(candidate.userID) &&
        isNonEmptyString(candidate.segmentID) &&
        isNonEmptyString(candidate.sourceStorageKey) &&
        isNonEmptyString(candidate.outputStorageKey) &&
        isNonNegativeNumber(candidate.startMilliseconds) &&
        isNonNegativeNumber(candidate.endMilliseconds) &&
        candidate.endMilliseconds > candidate.startMilliseconds
    );
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
