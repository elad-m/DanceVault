// Contains business rules and application workflows for videos.
import {
    createVideoStorageKey,
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

    const objectExists = await videoStorageProvider.videoObjectExists(
        video.storageKey
    );

    if (!objectExists) {
        return { kind: "upload_object_missing" };
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

type DeleteVideoWithStorageInput =
    VideoStorageOperationInput & {
        videoDataAccess: VideoDataAccess;
        segmentDataAccess: SegmentDataAccess;
    };

export type DeleteVideoWithStorageResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "invalid_upload_state";
    }
    | {
        kind: "deleted";
    };

export async function deleteVideoWithStorage({
    videoId,
    userId,
    videoStorageProvider,
    videoDataAccess,
    segmentDataAccess,
}: DeleteVideoWithStorageInput): Promise<DeleteVideoWithStorageResult> {
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
