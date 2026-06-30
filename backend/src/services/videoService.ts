import { prisma } from "../db";
import type { ExternalVideoSourceType } from "../domain/video";

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
    originalFileName: string;
};

export async function createPendingUploadVideo(
    input: CreatePendingUploadVideoInput
) {
    return prisma.video.create({
        data: {
            title: input.title,
            sourceType: "uploaded",
            sourceUrl: null,
            storageKey: input.storageKey,
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

export async function getVideoById({ videoId, userId }: VideoScope) {
    return prisma.video.findFirst({
        where: {
            id: videoId,
            userId,
        },
    });
}

export async function listVideos({ userId }: UserScope) {
    return prisma.video.findMany({
        where: {
            userId,
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
            },
        },
        orderBy: {
            startSeconds: "asc",
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
        },
        data,
    });
}

export async function deleteVideo({ videoId, userId }: VideoScope) {
    return prisma.video.delete({
        where: {
            id: videoId,
            userId,
        },
    });
}
