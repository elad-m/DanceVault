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
                sourceType: input.sourceType,
                sourceUrl: input.sourceURL,
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
};
