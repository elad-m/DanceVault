import { prisma } from "../db";
import type { FastifyInstance } from "fastify";

export const TEST_USER_ID = "test-user-1";
export const OTHER_TEST_USER_ID = "test-user-2";
export const OTHER_TEST_VIDEO_ID = "other-user-video";
export const OTHER_TEST_SEGMENT_ID = "other-user-segment";

export function registerTestAuthentication(app: FastifyInstance) {
    app.addHook("onRequest", async (request) => {
        request.headers["x-user-id"] = TEST_USER_ID;
    });
}

export async function clearTestDatabase() {
    await prisma.segment.deleteMany();
    await prisma.video.deleteMany();
    await prisma.user.deleteMany();
}

export async function resetTestDatabase() {
    await clearTestDatabase();
    await prisma.user.create({
        data: {
            id: TEST_USER_ID,
            email: "test-user@dancevault.local",
        },
    });
    await prisma.video.create({
        data: {
            id: "sample-video-1",
            title: "Test lesson summary",
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=test-video",
            user: {
                connect: {
                    id: TEST_USER_ID,
                },
            },
            segments: {
                create: [
                    {
                        name: "Open stance wave",
                        startSeconds: 10,
                        endSeconds: 20,
                        tags: ["wave"],
                        difficulty: "medium",
                        confidence: "low",
                        practicePriority: "high",
                    },
                    {
                        name: "Closed stance wave",
                        startSeconds: 30,
                        endSeconds: 40,
                        tags: ["wave"],
                        difficulty: "hard",
                        confidence: "medium",
                        practicePriority: "medium",
                    },
                    {
                        name: "Basic step",
                        startSeconds: 50,
                        endSeconds: 60,
                        tags: ["basic"],
                        difficulty: "easy",
                        confidence: "high",
                        practicePriority: "low",
                    },
                ],
            },
        },
    });
}

export async function createOtherUserTestData() {
    await prisma.user.create({
        data: {
            id: OTHER_TEST_USER_ID,
            email: "other-user@dancevault.local",
            videos: {
                create: {
                    id: OTHER_TEST_VIDEO_ID,
                    title: "Another user's lesson",
                    sourceType: "youtube",
                    sourceUrl:
                        "https://youtube.com/watch?v=other-user-video",
                    segments: {
                        create: {
                            id: OTHER_TEST_SEGMENT_ID,
                            name: "Another user's weak segment",
                            startSeconds: 10,
                            endSeconds: 20,
                            tags: ["other-user-test"],
                            confidence: "low",
                            practicePriority: "high",
                        },
                    },
                },
            },
        },
    });
}
