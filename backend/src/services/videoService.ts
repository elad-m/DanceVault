// Contains business rules and application workflows for videos.
import {
    createVideoStorageKey,
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
import {
    CURRENT_VIDEO_DELETION_JOB_SCHEMA_VERSION,
    type VideoDeletionJob,
    type VideoDeletionQueue,
} from "../jobs/videoDeletionQueue";

type UserScope = {
    userId: string;
};

type VideoScope = UserScope & {
    videoId: string;
};

type InitializeVideoUploadInput = UserScope & {
    title: string;
    fileName: string;
    contentType: SupportedVideoContentType;
    videoStorageProvider: VideoStorageProvider;
    videoDataAccess: VideoDataAccess;
};

export async function initializeVideoUpload({
    userId,
    title,
    fileName,
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

    const objectSizeBytes =
        await videoStorageProvider.getVideoObjectSizeBytes(
            video.storageKey
        );

    if (objectSizeBytes === null) {
        return { kind: "upload_object_missing" };
    }

    if (objectSizeBytes > maxVideoUploadSizeBytes) {
        await videoDataAccess.updateVideoStatus({
            videoID: video.id,
            userID: userId,
            status: "upload_failed",
        });

        await videoStorageProvider.deleteVideoObject(
            video.storageKey
        );

        return { kind: "upload_too_large" };
    }

    const readyVideo = await videoDataAccess.updateVideoStatus({
        videoID: video.id,
        userID: userId,
        status: "ready",
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

    await videoDataAccess.updateVideoStatus({
        videoID: video.id,
        userID: userId,
        status: "deleting",
    });

    await videoStorageProvider.deleteVideoObject(
        video.storageKey
    );

    const segments =
        await segmentDataAccess.listSegmentsByVideo({
            videoID: video.id,
            userID: userId,
        });

    for (const segment of segments) {
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
