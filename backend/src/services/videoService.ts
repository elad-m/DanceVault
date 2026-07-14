import { prisma } from "../db";
import {
    createVideoStorageKey,
    type ExternalVideoSourceType,
    type SupportedVideoContentType,
} from "../domain/video";
import { randomUUID } from "node:crypto";
import {
    videoUrlExpirationSeconds,
    type VideoStorageProvider,
} from "../storage";
import type { VideoStorageProviderName } from "../domain/video";
import { runtime } from "../runtime";

type CreateVideoInput = {
    userId: string;
    title: string;
    sourceType: ExternalVideoSourceType;
    sourceUrl: string;
};

type UserScope = {
    userId: string;
};

type VideoScope = UserScope & {
    videoId: string;
};

export async function createVideo(input: CreateVideoInput) {
    return prisma.video.create({
        data: {
            title: input.title,
            environment: runtime.environment,
            sourceType: input.sourceType,
            sourceUrl: input.sourceUrl,
            user: {
                connect: {
                    id: input.userId,
                },
            },
        },
    });
}

type CreatePendingUploadVideoInput = {
    userId: string;
    title: string;
    storageKey: string;
    storageProvider: VideoStorageProviderName;
    originalFileName: string;
};

export async function createPendingUploadVideo(
    input: CreatePendingUploadVideoInput
) {
    return prisma.video.create({
        data: {
            title: input.title,
            environment: runtime.environment,
            sourceType: "uploaded",
            sourceUrl: null,
            storageKey: input.storageKey,
            storageProvider: input.storageProvider,
            originalFileName: input.originalFileName,
            status: "pending_upload",
            user: {
                connect: {
                    id: input.userId,
                },
            },
        },
    });
}

export async function markVideoUploadReady({
    videoId,
    userId,
}: VideoScope) {
    return prisma.video.update({
        where: {
            id: videoId,
            userId,
            environment: runtime.environment,
        },
        data: {
            status: "ready",
        },
    });
}

export async function getVideoById({ videoId, userId }: VideoScope) {
    return prisma.video.findFirst({
        where: {
            id: videoId,
            userId,
            environment: runtime.environment,
        },
    });
}

export async function listVideos({ userId }: UserScope) {
    return prisma.video.findMany({
        where: {
            userId,
            environment: runtime.environment,
        },
        orderBy: {
            createdAt: "asc",
        },
    });
}

export async function getVideoSegments({ videoId, userId }: VideoScope) {
    return prisma.segment.findMany({
        where: {
            videoId,
            video: {
                userId,
                environment: runtime.environment,
            },
        },
        orderBy: {
            startMilliseconds: "asc",
        },
    });
}

type UpdateVideoInput = VideoScope & {
    title?: string;
};

export async function updateVideo(input: UpdateVideoInput) {
    const { videoId, userId, ...data } = input;

    return prisma.video.update({
        where: {
            id: videoId,
            userId,
            environment: runtime.environment,
        },
        data,
    });
}

export async function deleteVideo({ videoId, userId }: VideoScope) {
    return prisma.video.delete({
        where: {
            id: videoId,
            userId,
            environment: runtime.environment,
        },
    });
}

type InitializeVideoUploadInput = UserScope & {
    title: string;
    fileName: string;
    contentType: SupportedVideoContentType;
    videoStorageProvider: VideoStorageProvider;
};

export async function initializeVideoUpload({
    userId,
    title,
    fileName,
    contentType,
    videoStorageProvider,
}: InitializeVideoUploadInput) {
    const uploadId = randomUUID();
    const storageKey = createVideoStorageKey({
        userId,
        uploadId,
    });
    const uploadUrl = await videoStorageProvider.createVideoUploadUrl({
        storageKey,
        contentType,
    });

    const video = await createPendingUploadVideo({
        userId,
        title,
        storageKey,
        storageProvider: videoStorageProvider.name,
        originalFileName: fileName,
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
          video: Awaited<ReturnType<typeof getVideoById>>;
      };

type VideoStorageOperationInput = VideoScope & {
    videoStorageProvider: VideoStorageProvider;
};

export async function completeVideoUpload({
    videoId,
    userId,
    videoStorageProvider,
}: VideoStorageOperationInput): Promise<VideoUploadCompletionResult> {
    const video = await getVideoById({
        videoId,
        userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (
        video.sourceType !== "uploaded" ||
        !video.storageKey ||
        video.storageProvider !== videoStorageProvider.name
    ) {
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

    const readyVideo = await markVideoUploadReady({
        videoId: video.id,
        userId,
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

export async function createUploadedVideoPlaybackUrl({
    videoId,
    userId,
    videoStorageProvider,
}: VideoStorageOperationInput): Promise<VideoPlaybackUrlResult> {
    const video = await getVideoById({
        videoId,
        userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (
        video.sourceType !== "uploaded" ||
        !video.storageKey ||
        video.storageProvider !== videoStorageProvider.name
    ) {
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
}: VideoStorageOperationInput): Promise<DeleteVideoWithStorageResult> {
    const video = await getVideoById({
        videoId,
        userId,
    });

    if (!video) {
        return { kind: "not_found" };
    }

    if (video.sourceType === "uploaded" && video.storageKey) {
        if (video.storageProvider !== videoStorageProvider.name) {
            return { kind: "invalid_upload_state" };
        }

        await videoStorageProvider.deleteVideoObject(video.storageKey);
    }

    await deleteVideo({
        videoId,
        userId,
    });

    return { kind: "deleted" };
}
