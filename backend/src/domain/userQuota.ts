import type { VideoStatus } from "./video";

export const maximumStoredVideoBytesPerUser = 10_000_000_000;
export const maximumVideosPerUser = 100;
export const maximumSegmentsPerUser = 1_000;
export const maximumSegmentsPerVideo = 200;
export const maximumPendingVideoUploadsPerUser = 3;

export type QuotaCountedVideo = {
    id: string;
    status: VideoStatus;
    fileSizeBytes: number | null;
};

export type UserQuotaUsage = {
    storedVideoBytes: number;
    pendingVideoBytes: number;
    videoCount: number;
    segmentCount: number;
    pendingVideoUploadCount: number;
};

export type UserQuotaLimitName =
    | "stored_video_bytes"
    | "video_count"
    | "pending_video_upload_count";

export class UserQuotaExceededError extends Error {
    constructor(
        public readonly limitName: UserQuotaLimitName
    ) {
        super(`User quota exceeded: ${limitName}`);
        this.name = "UserQuotaExceededError";
    }
}

type CalculateVideoUploadReservationInput = {
    currentUsage: UserQuotaUsage;
    fileSizeBytes: number;
};

export function calculateVideoUploadReservation({
    currentUsage,
    fileSizeBytes,
}: CalculateVideoUploadReservationInput): UserQuotaUsage {
    if (!Number.isInteger(fileSizeBytes) || fileSizeBytes < 1) {
        throw new Error(
            "Video upload reservation size must be a positive integer"
        );
    }

    if (currentUsage.videoCount >= maximumVideosPerUser) {
        throw new UserQuotaExceededError("video_count");
    }

    if (
        currentUsage.pendingVideoUploadCount >=
        maximumPendingVideoUploadsPerUser
    ) {
        throw new UserQuotaExceededError(
            "pending_video_upload_count"
        );
    }

    if (
        currentUsage.storedVideoBytes +
            currentUsage.pendingVideoBytes +
            fileSizeBytes >
        maximumStoredVideoBytesPerUser
    ) {
        throw new UserQuotaExceededError(
            "stored_video_bytes"
        );
    }

    return {
        ...currentUsage,
        pendingVideoBytes:
            currentUsage.pendingVideoBytes + fileSizeBytes,
        videoCount: currentUsage.videoCount + 1,
        pendingVideoUploadCount:
            currentUsage.pendingVideoUploadCount + 1,
    };
}

type CalculateVideoUploadCompletionInput = {
    currentUsage: UserQuotaUsage;
    reservedFileSizeBytes: number;
    actualFileSizeBytes: number;
};

export function calculateVideoUploadCompletion({
    currentUsage,
    reservedFileSizeBytes,
    actualFileSizeBytes,
}: CalculateVideoUploadCompletionInput): UserQuotaUsage {
    if (
        !Number.isInteger(reservedFileSizeBytes) ||
        reservedFileSizeBytes < 1 ||
        !Number.isInteger(actualFileSizeBytes) ||
        actualFileSizeBytes < 1
    ) {
        throw new Error(
            "Video upload completion sizes must be positive integers"
        );
    }

    if (
        currentUsage.pendingVideoBytes <
            reservedFileSizeBytes ||
        currentUsage.pendingVideoUploadCount < 1
    ) {
        throw new Error(
            "User quota usage does not contain the pending upload reservation"
        );
    }

    const completedUsage: UserQuotaUsage = {
        ...currentUsage,
        storedVideoBytes:
            currentUsage.storedVideoBytes +
            actualFileSizeBytes,
        pendingVideoBytes:
            currentUsage.pendingVideoBytes -
            reservedFileSizeBytes,
        pendingVideoUploadCount:
            currentUsage.pendingVideoUploadCount - 1,
    };

    if (
        completedUsage.storedVideoBytes +
            completedUsage.pendingVideoBytes >
        maximumStoredVideoBytesPerUser
    ) {
        throw new UserQuotaExceededError(
            "stored_video_bytes"
        );
    }

    return completedUsage;
}

type CalculateVideoUploadFailureInput = {
    currentUsage: UserQuotaUsage;
    reservedFileSizeBytes: number;
};

export function calculateVideoUploadFailure({
    currentUsage,
    reservedFileSizeBytes,
}: CalculateVideoUploadFailureInput): UserQuotaUsage {
    if (
        !Number.isInteger(reservedFileSizeBytes) ||
        reservedFileSizeBytes < 1
    ) {
        throw new Error(
            "Failed video upload reservation size must be a positive integer"
        );
    }

    if (
        currentUsage.pendingVideoBytes <
            reservedFileSizeBytes ||
        currentUsage.pendingVideoUploadCount < 1
    ) {
        throw new Error(
            "User quota usage does not contain the failed upload reservation"
        );
    }

    return {
        ...currentUsage,
        pendingVideoBytes:
            currentUsage.pendingVideoBytes -
            reservedFileSizeBytes,
        pendingVideoUploadCount:
            currentUsage.pendingVideoUploadCount - 1,
    };
}

export type VideoDeletionSourceStatus = Exclude<
    VideoStatus,
    "deleting"
>;

type CalculateVideoDeletionQuotaInput = {
    currentUsage: UserQuotaUsage;
    sourceStatus: VideoDeletionSourceStatus;
    fileSizeBytes: number | null;
};

export function calculateVideoDeletionQuota({
    currentUsage,
    sourceStatus,
    fileSizeBytes,
}: CalculateVideoDeletionQuotaInput): UserQuotaUsage {
    if (currentUsage.videoCount < 1) {
        throw new Error(
            "User quota usage does not contain the video being deleted"
        );
    }

    const deletedUsage: UserQuotaUsage = {
        ...currentUsage,
        videoCount: currentUsage.videoCount - 1,
    };

    if (sourceStatus === "upload_failed") {
        return deletedUsage;
    }

    if (
        !Number.isInteger(fileSizeBytes) ||
        fileSizeBytes === null ||
        fileSizeBytes < 1
    ) {
        throw new Error(
            "Quota-counted video size must be a positive integer"
        );
    }

    if (sourceStatus === "ready") {
        if (currentUsage.storedVideoBytes < fileSizeBytes) {
            throw new Error(
                "User quota usage does not contain the stored video bytes"
            );
        }

        return {
            ...deletedUsage,
            storedVideoBytes:
                currentUsage.storedVideoBytes - fileSizeBytes,
        };
    }

    if (
        currentUsage.pendingVideoBytes < fileSizeBytes ||
        currentUsage.pendingVideoUploadCount < 1
    ) {
        throw new Error(
            "User quota usage does not contain the pending video reservation"
        );
    }

    return {
        ...deletedUsage,
        pendingVideoBytes:
            currentUsage.pendingVideoBytes - fileSizeBytes,
        pendingVideoUploadCount:
            currentUsage.pendingVideoUploadCount - 1,
    };
}

export type SegmentQuotaLimitName =
    | "segment_count"
    | "segments_per_video";

export class SegmentQuotaExceededError extends Error {
    constructor(
        public readonly limitName: SegmentQuotaLimitName
    ) {
        super(`Segment quota exceeded: ${limitName}`);
        this.name = "SegmentQuotaExceededError";
    }
}

type CalculateSegmentCreationQuotaInput = {
    currentUsage: UserQuotaUsage;
    currentVideoSegmentCount: number;
};

type SegmentCreationQuota = {
    userQuotaUsage: UserQuotaUsage;
    videoSegmentCount: number;
};

export function calculateSegmentCreationQuota({
    currentUsage,
    currentVideoSegmentCount,
}: CalculateSegmentCreationQuotaInput): SegmentCreationQuota {
    if (
        !Number.isInteger(currentVideoSegmentCount) ||
        currentVideoSegmentCount < 0
    ) {
        throw new Error(
            "Video segment count must be a non-negative integer"
        );
    }

    if (currentUsage.segmentCount >= maximumSegmentsPerUser) {
        throw new SegmentQuotaExceededError("segment_count");
    }

    if (currentVideoSegmentCount >= maximumSegmentsPerVideo) {
        throw new SegmentQuotaExceededError(
            "segments_per_video"
        );
    }

    return {
        userQuotaUsage: {
            ...currentUsage,
            segmentCount: currentUsage.segmentCount + 1,
        },
        videoSegmentCount: currentVideoSegmentCount + 1,
    };
}

export type UserQuotaReconciliationInput = {
    userID: string;
    videos: QuotaCountedVideo[];
    segmentCount: number;
    persistedUsage: UserQuotaUsage | null;
};

export type UserQuotaReconciliationIssue =
    | {
        kind: "missing_file_size_metadata";
        userID: string;
        videoIDs: string[];
    }
    | {
        kind: "missing_persisted_usage";
        userID: string;
        expectedUsage: UserQuotaUsage;
    }
    | {
        kind: "usage_mismatch";
        userID: string;
        expectedUsage: UserQuotaUsage;
        persistedUsage: UserQuotaUsage;
    };

export type UserQuotaReconciliationReport = {
    healthy: Array<{
        userID: string;
        usage: UserQuotaUsage;
    }>;
    issues: UserQuotaReconciliationIssue[];
};

type CalculateUserQuotaUsageInput = {
    videos: QuotaCountedVideo[];
    segmentCount: number;
};

function getVideoFileSizeBytes(
    video: QuotaCountedVideo
): number {
    if (video.fileSizeBytes === null) {
        throw new Error(
            `Video ${video.id} needs file-size metadata before quota usage can be calculated`
        );
    }

    return video.fileSizeBytes;
}

export function calculateUserQuotaUsage({
    videos,
    segmentCount,
}: CalculateUserQuotaUsageInput): UserQuotaUsage {
    const usage: UserQuotaUsage = {
        storedVideoBytes: 0,
        pendingVideoBytes: 0,
        videoCount: videos.length,
        segmentCount,
        pendingVideoUploadCount: 0,
    };

    for (const video of videos) {
        switch (video.status) {
            case "ready":
            case "deleting":
                usage.storedVideoBytes +=
                    getVideoFileSizeBytes(video);
                break;

            case "pending_upload":
                usage.pendingVideoBytes +=
                    getVideoFileSizeBytes(video);
                usage.pendingVideoUploadCount += 1;
                break;

            case "upload_failed":
                break;
        }
    }

    return usage;
}

function userQuotaUsageMatches(
    first: UserQuotaUsage,
    second: UserQuotaUsage
): boolean {
    return (
        first.storedVideoBytes === second.storedVideoBytes &&
        first.pendingVideoBytes === second.pendingVideoBytes &&
        first.videoCount === second.videoCount &&
        first.segmentCount === second.segmentCount &&
        first.pendingVideoUploadCount ===
            second.pendingVideoUploadCount
    );
}

export function reconcileUserQuotaUsage(
    sources: UserQuotaReconciliationInput[]
): UserQuotaReconciliationReport {
    const report: UserQuotaReconciliationReport = {
        healthy: [],
        issues: [],
    };

    for (const source of [...sources].sort((first, second) =>
        first.userID.localeCompare(second.userID)
    )) {
        const missingFileSizeVideoIDs = source.videos
            .filter(
                (video) =>
                    video.status !== "upload_failed" &&
                    video.fileSizeBytes === null
            )
            .map((video) => video.id)
            .sort();

        if (missingFileSizeVideoIDs.length > 0) {
            report.issues.push({
                kind: "missing_file_size_metadata",
                userID: source.userID,
                videoIDs: missingFileSizeVideoIDs,
            });
            continue;
        }

        const expectedUsage = calculateUserQuotaUsage({
            videos: source.videos,
            segmentCount: source.segmentCount,
        });

        if (!source.persistedUsage) {
            report.issues.push({
                kind: "missing_persisted_usage",
                userID: source.userID,
                expectedUsage,
            });
            continue;
        }

        if (
            !userQuotaUsageMatches(
                expectedUsage,
                source.persistedUsage
            )
        ) {
            report.issues.push({
                kind: "usage_mismatch",
                userID: source.userID,
                expectedUsage,
                persistedUsage: source.persistedUsage,
            });
            continue;
        }

        report.healthy.push({
            userID: source.userID,
            usage: expectedUsage,
        });
    }

    return report;
}
