export const CURRENT_VIDEO_DELETION_JOB_SCHEMA_VERSION = 1 as const;

export type VideoDeletionJob = {
    schemaVersion:
        typeof CURRENT_VIDEO_DELETION_JOB_SCHEMA_VERSION;
    jobID: string;
    userID: string;
    videoID: string;
};

export type VideoDeletionQueue = {
    enqueue(job: VideoDeletionJob): Promise<void>;
    close(): void;
};

export function parseVideoDeletionJob(
    messageBody: string
): VideoDeletionJob {
    try {
        const parsedValue: unknown =
            JSON.parse(messageBody);

        if (!isVideoDeletionJob(parsedValue)) {
            throw new Error();
        }

        return parsedValue;
    } catch {
        throw new Error("Invalid video deletion job");
    }
}

function isVideoDeletionJob(
    value: unknown
): value is VideoDeletionJob {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        candidate.schemaVersion ===
            CURRENT_VIDEO_DELETION_JOB_SCHEMA_VERSION &&
        isNonEmptyString(candidate.jobID) &&
        isNonEmptyString(candidate.userID) &&
        isNonEmptyString(candidate.videoID)
    );
}

function isNonEmptyString(
    value: unknown
): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0
    );
}