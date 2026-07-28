// Implements video database reads using Prisma and PostgreSQL.

import { prisma } from "../db";
import { runtime } from "../runtime";
import type { VideoDataAccess } from "./videoDataAccess";

export const prismaVideoDataAccess: VideoDataAccess = {
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
