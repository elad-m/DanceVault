// Contains business rules and application workflows for videos.
import {
    createVideoThumbnailStorageKey,
    createVideoStorageKey,
    maxVideoThumbnailSizeBytes,
    maxVideoUploadSizeBytes,
    type SupportedVideoContentType,
} from "../domain/video";
import { randomUUID } from "node:crypto";
import {
    videoUrlExpirationSeconds,
    type VideoStorageProvider,
} from "../storage";
import type {
    VideoDataAccess,
    VideoDataAccessItem,
} from "../persistence/videoDataAccess";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";
import { deleteSegmentExport } from "./segmentExportService";
import {
    CURRENT_VIDEO_DELETION_JOB_SCHEMA_VERSION,
    type VideoDeletionJob,
    type VideoDeletionQueue,
} from "../jobs/videoDeletionQueue";
import {
    createLegacySegmentThumbnailStorageKey,
    createSegmentThumbnailStorageKey,
} from "../domain/segment";

type UserScope = {
    userId: string;
};

type VideoScope = UserScope & {
    videoId: string;
};

type InitializeVideoUploadInput = UserScope & {
    title: string;
    fileName: string;
    fileSizeBytes: number;
    contentType: SupportedVideoContentType;
    videoStorageProvider: VideoStorageProvider;
    videoDataAccess: VideoDataAccess;
};

export async function initializeVideoUpload({
    userId,
    title,
    fileName,
    fileSizeBytes,
    contentType,
    videoStorageProvider,
    videoDataAccess,
}: InitializeVideoUploadInput) {
    const videoID = randomUUID();
    const storageKey = createVideoStorageKey({
        userId,
        uploadId: videoID,
        contentType,
    });
    const uploadUrl = await videoStorageProvider.createVideoUploadUrl({
        storageKey,
        contentType,
    });

    const video = await videoDataAccess.createVideo({
        videoID,
        userID: userId,
        title,
        storageKey,
        storageProvider: videoStorageProvider.name,
        originalFileName: fileName,
        fileSizeBytes,
        status: "pending_upload",
        createdAt: new Date(),
    });

    return {
        video,
        uploadUrl,
    };
}

export type VideoUploadCompletionResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "invalid_upload_state";
    }
    | {
        kind: "upload_object_missing";
    }
    | {
        kind: "upload_too_large";
    }
    | {
        kind: "ready";
        video: VideoDataAccessItem;
    };

type CompleteVideoUploadInput = VideoStorageOperationInput & {
    videoDataAccess: VideoDataAccess;
};

type VideoStorageOperationInput = VideoScope & {
    videoStorageProvider: VideoStorageProvider;
};

export async function completeVideoUpload({
    videoId,
    userId,
    videoStorageProvider,
    videoDataAccess,
}: CompleteVideoUploadInput): Promise<VideoUploadCompletionResult> {
    const video = await videoDataAccess.getVideoByID({
        videoID: videoId,
        userID: userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.storageProvider !== videoStorageProvider.name) {
        return { kind: "invalid_upload_state" };
    }

    if (video.status === "ready") {
        return {
            kind: "ready",
            video,
        };
    }

    if (video.status !== "pending_upload") {
        return { kind: "invalid_upload_state" };
    }

    const objectSizeBytes =
        await videoStorageProvider.getVideoObjectSizeBytes(
            video.storageKey
        );

    if (objectSizeBytes === null) {
        return { kind: "upload_object_missing" };
    }

    if (objectSizeBytes > maxVideoUploadSizeBytes) {
        await videoDataAccess.markVideoUploadFailed({
            videoID: video.id,
            userID: userId,
        });

        await videoStorageProvider.deleteVideoObject(
            video.storageKey
        );

        return { kind: "upload_too_large" };
    }

    const readyVideo = await videoDataAccess.finalizeVideoUpload({
        videoID: video.id,
        userID: userId,
        fileSizeBytes: objectSizeBytes,
    });

    return {
        kind: "ready",
        video: readyVideo,
    };
}

export type VideoPlaybackUrlResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "invalid_upload_state";
    }
    | {
        kind: "not_ready";
    }
    | {
        kind: "ready";
        playbackUrl: string;
        expiresInSeconds: number;
    };

type CreateVideoPlaybackUrlInput = VideoStorageOperationInput & {
    videoDataAccess: VideoDataAccess;
};

export async function createVideoPlaybackUrl({
    videoId,
    userId,
    videoStorageProvider,
    videoDataAccess,
}: CreateVideoPlaybackUrlInput): Promise<VideoPlaybackUrlResult> {
    const video = await videoDataAccess.getVideoByID({
        videoID: videoId,
        userID: userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.storageProvider !== videoStorageProvider.name) {
        return { kind: "invalid_upload_state" };
    }

    if (video.status !== "ready") {
        return { kind: "not_ready" };
    }

    const playbackUrl =
        await videoStorageProvider.createVideoPlaybackUrl(
            video.storageKey
        );

    return {
        kind: "ready",
        playbackUrl,
        expiresInSeconds: videoUrlExpirationSeconds,
    };
}

type VideoThumbnailStorageInput = VideoStorageOperationInput & {
    videoDataAccess: VideoDataAccess;
};

type VideoThumbnailAccessFailure =
    | {
        kind: "not_found";
    }
    | {
        kind: "invalid_upload_state";
    }
    | {
        kind: "not_ready";
    };

export type InitializeVideoThumbnailUploadResult =
    | VideoThumbnailAccessFailure
    | {
        kind: "upload_ready";
        uploadUrl: string;
        expiresInSeconds: number;
    };

export async function initializeVideoThumbnailUpload(
    input: VideoThumbnailStorageInput
): Promise<InitializeVideoThumbnailUploadResult> {
    const video = await input.videoDataAccess.getVideoByID({
        videoID: input.videoId,
        userID: input.userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.storageProvider !== input.videoStorageProvider.name) {
        return { kind: "invalid_upload_state" };
    }

    if (video.status !== "ready") {
        return { kind: "not_ready" };
    }

    const storageKey = createVideoThumbnailStorageKey({
        userId: input.userId,
        videoId: video.id,
    });
    const uploadUrl =
        await input.videoStorageProvider
            .createVideoThumbnailUploadUrl(storageKey);

    return {
        kind: "upload_ready",
        uploadUrl,
        expiresInSeconds: videoUrlExpirationSeconds,
    };
}

export type CompleteVideoThumbnailUploadResult =
    | VideoThumbnailAccessFailure
    | {
        kind: "upload_object_missing";
    }
    | {
        kind: "upload_too_large";
    }
    | {
        kind: "ready";
    };

export async function completeVideoThumbnailUpload(
    input: VideoThumbnailStorageInput
): Promise<CompleteVideoThumbnailUploadResult> {
    const video = await input.videoDataAccess.getVideoByID({
        videoID: input.videoId,
        userID: input.userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.storageProvider !== input.videoStorageProvider.name) {
        return { kind: "invalid_upload_state" };
    }

    if (video.status !== "ready") {
        return { kind: "not_ready" };
    }

    const storageKey = createVideoThumbnailStorageKey({
        userId: input.userId,
        videoId: video.id,
    });
    const objectSizeBytes =
        await input.videoStorageProvider
            .getVideoThumbnailObjectSizeBytes(storageKey);

    if (objectSizeBytes === null) {
        return { kind: "upload_object_missing" };
    }

    if (objectSizeBytes > maxVideoThumbnailSizeBytes) {
        await input.videoStorageProvider
            .deleteVideoThumbnailObject(storageKey);

        return { kind: "upload_too_large" };
    }

    return { kind: "ready" };
}

export type GetVideoThumbnailPlaybackUrlResult =
    | VideoThumbnailAccessFailure
    | {
        kind: "thumbnail_missing";
    }
    | {
        kind: "ready";
        playbackUrl: string;
        expiresInSeconds: number;
    };

export async function getVideoThumbnailPlaybackUrl(
    input: VideoThumbnailStorageInput
): Promise<GetVideoThumbnailPlaybackUrlResult> {
    const video = await input.videoDataAccess.getVideoByID({
        videoID: input.videoId,
        userID: input.userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.storageProvider !== input.videoStorageProvider.name) {
        return { kind: "invalid_upload_state" };
    }

    if (video.status !== "ready") {
        return { kind: "not_ready" };
    }

    const storageKey = createVideoThumbnailStorageKey({
        userId: input.userId,
        videoId: video.id,
    });
    const objectSizeBytes =
        await input.videoStorageProvider
            .getVideoThumbnailObjectSizeBytes(storageKey);

    if (objectSizeBytes === null) {
        return { kind: "thumbnail_missing" };
    }

    const playbackUrl =
        await input.videoStorageProvider
            .createVideoThumbnailPlaybackUrl(storageKey);

    return {
        kind: "ready",
        playbackUrl,
        expiresInSeconds: videoUrlExpirationSeconds,
    };
}

type RequestVideoDeletionInput = VideoScope & {
    videoDataAccess: VideoDataAccess;
    videoDeletionQueue: VideoDeletionQueue;
};

export type RequestVideoDeletionResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "queued";
        job: VideoDeletionJob;
    };

export async function requestVideoDeletion({
    videoId,
    userId,
    videoDataAccess,
    videoDeletionQueue,
}: RequestVideoDeletionInput): Promise<RequestVideoDeletionResult> {
    const video = await videoDataAccess.getVideoByID({
        videoID: videoId,
        userID: userId,
    });

    if (!video) {
        return {
            kind: "not_found",
        };
    }

    const job: VideoDeletionJob = {
        schemaVersion:
            CURRENT_VIDEO_DELETION_JOB_SCHEMA_VERSION,
        jobID: randomUUID(),
        userID: userId,
        videoID: video.id,
    };

    await videoDeletionQueue.enqueue(job);

    return {
        kind: "queued",
        job,
    };
}

type ExecuteVideoDeletionInput =
    VideoStorageOperationInput & {
        videoDataAccess: VideoDataAccess;
        segmentDataAccess: SegmentDataAccess;
        segmentExportDataAccess: SegmentExportDataAccess;
        segmentExportStorageProvider: SegmentExportStorageProvider;
    };

export type ExecuteVideoDeletionResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "invalid_upload_state";
    }
    | {
        kind: "deleted";
    };

export async function executeVideoDeletion({
    videoId,
    userId,
    videoStorageProvider,
    videoDataAccess,
    segmentDataAccess,
    segmentExportDataAccess,
    segmentExportStorageProvider,
}: ExecuteVideoDeletionInput): Promise<ExecuteVideoDeletionResult> {
    const video = await videoDataAccess.getVideoByID({
        videoID: videoId,
        userID: userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.storageProvider !== videoStorageProvider.name) {
        return { kind: "invalid_upload_state" };
    }

    await videoDataAccess.markVideoDeleting({
        videoID: video.id,
        userID: userId,
    });

    await videoStorageProvider.deleteVideoObject(
        video.storageKey
    );

    const videoThumbnailStorageKey =
        createVideoThumbnailStorageKey({
            userId,
            videoId: video.id,
        });

    await videoStorageProvider.deleteVideoThumbnailObject(
        videoThumbnailStorageKey
    );

    const segments =
        await segmentDataAccess.listSegmentsByVideo({
            videoID: video.id,
            userID: userId,
        });

    for (const segment of segments) {
        await deleteSegmentExport({
            userID: userId,
            segmentID: segment.id,
            segmentExportDataAccess,
            segmentExportStorageProvider,
        });

        const thumbnailStorageKey =
            createSegmentThumbnailStorageKey({
                userId,
                segmentId: segment.id,
            });

        await videoStorageProvider
            .deleteSegmentThumbnailObject(
                thumbnailStorageKey
            );

        const legacyThumbnailStorageKey =
            createLegacySegmentThumbnailStorageKey({
                userId,
                segmentId: segment.id,
            });

        await videoStorageProvider
            .deleteSegmentThumbnailObject(
                legacyThumbnailStorageKey
            );

        await segmentDataAccess.deleteSegment({
            segmentID: segment.id,
            videoID: video.id,
            userID: userId,
        });
    }

    await videoDataAccess.deleteVideo({
        videoID: video.id,
        userID: userId,
    });

    return { kind: "deleted" };
}
