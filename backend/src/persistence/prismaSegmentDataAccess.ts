// Implements segment database operations using Prisma and PostgreSQL.

import { prisma } from "../db";
import { runtime } from "../runtime";
import type { SegmentDataAccess } from "./segmentDataAccess";

export const prismaSegmentDataAccess: SegmentDataAccess = {
    async createSegment(input) {
        return prisma.segment.create({
            data: {
                id: input.segmentID,
                video: {
                    connect: {
                        id: input.videoID,
                        userId: input.userID,
                        environment: runtime.environment,
                    },
                },
                name: input.name,
                description: input.description,
                startMilliseconds: input.startMilliseconds,
                endMilliseconds: input.endMilliseconds,
                tags: input.tags,
                difficulty: input.difficulty,
                confidence: input.confidence,
                practicePriority: input.practicePriority,
                createdAt: input.createdAt,
            },
        });
    },

    async getSegmentByID({ userID, segmentID }) {
        return prisma.segment.findFirst({
            where: {
                id: segmentID,
                video: {
                    userId: userID,
                    environment: runtime.environment,
                },
            },
        });
    },

    async listSegments({ userID }) {
        return prisma.segment.findMany({
            where: {
                video: {
                    userId: userID,
                    environment: runtime.environment,
                },
            },
        });
    },

    async listSegmentsByVideo({ userID, videoID }) {
        return prisma.segment.findMany({
            where: {
                videoId: videoID,
                video: {
                    userId: userID,
                    environment: runtime.environment,
                },
            },
            orderBy: {
                startMilliseconds: "asc",
            },
        });
    },

    async updateSegmentMetadata(input) {
        const {
            userID,
            segmentID,
            ...metadata
        } = input;

        return prisma.segment.update({
            where: {
                id: segmentID,
                video: {
                    userId: userID,
                    environment: runtime.environment,
                },
            },
            data: metadata,
        });
    },

    async deleteSegment({
        userID,
        videoID,
        segmentID,
    }) {
        await prisma.segment.delete({
            where: {
                id: segmentID,
                videoId: videoID,
                video: {
                    userId: userID,
                    environment: runtime.environment,
                },
            },
        });
    },
};