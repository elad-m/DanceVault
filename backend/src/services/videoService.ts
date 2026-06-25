import { prisma } from "../db";

type CreateVideoInput = {
    title: string;
    sourceType: string;
    sourceUrl: string;
};

export async function createVideo(input: CreateVideoInput) {
    return prisma.video.create({
        data: {
            title: input.title,
            sourceType: input.sourceType,
            sourceUrl: input.sourceUrl,
        },
    });
}

export async function getVideoById(videoId: string) {
    return prisma.video.findUnique({
        where: {
            id: videoId,
        },
    });
}

export async function listVideos() {
    return prisma.video.findMany({
        orderBy: {
            createdAt: "asc",
        },
    });
}

export async function getVideoSegments(videoId: string) {
    return prisma.segment.findMany({
        where: {
            videoId,
        },
        orderBy: {
            startSeconds: "asc",
        },
    });
}

type UpdateVideoInput = {
    videoId: string;
    title?: string;
    sourceType?: string;
    sourceUrl?: string;
};

export async function updateVideo(input: UpdateVideoInput) {
    const { videoId, ...data } = input;

    return prisma.video.update({
        where: {
            id: videoId,
        },
        data,
    });
}

export async function deleteVideo(videoId: string) {
    return prisma.video.delete({
        where: {
            id: videoId,
        },
    });
}
