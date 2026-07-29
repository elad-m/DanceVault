// Implements video database operations using Prisma and PostgreSQL.

import { prisma } from "../db";
import { runtime } from "../runtime";
import type { VideoDataAccess } from "./videoDataAccess";

export const prismaVideoDataAccess: VideoDataAccess = {
    async createVideo(input) {
        return prisma.video.create({
            data: {
                id: input.videoID,
                title: input.title,
                environment: runtime.environment,
                storageKey: input.storageKey,
                storageProvider: input.storageProvider,
                originalFileName: input.originalFileName,
                status: input.status,
                createdAt: input.createdAt,
                user: {
                    connect: {
                        id: input.userID,
                    },
                },
            },
        });
    },

    async updateVideoStatus({ userID, videoID, status }) {
        return prisma.video.update({
            where: {
                id: videoID,
                userId: userID,
                environment: runtime.environment,
            },
            data: {
                status,
            },
        });
    },

    async getVideoByID({ userID, videoID }) {
        return prisma.video.findFirst({
            where: {
                id: videoID,
                userId: userID,
                environment: runtime.environment,
            },
        });
    },

    async listVideos({ userID }) {
        return prisma.video.findMany({
            where: {
                userId: userID,
                environment: runtime.environment,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
    },

    async updateVideoTitle({ userID, videoID, title }) {
        return prisma.video.update({
            where: {
                id: videoID,
                userId: userID,
                environment: runtime.environment,
            },
            data: {
                title,
            },
        });
    },

    async deleteVideo({ userID, videoID }) {
        await prisma.video.delete({
            where: {
                id: videoID,
                userId: userID,
                environment: runtime.environment,
            },
        });
    },
};
