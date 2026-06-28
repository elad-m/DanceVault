import { prisma } from "../db";

export async function clearTestDatabase() {
    await prisma.segment.deleteMany();
    await prisma.video.deleteMany();
}

export async function resetTestDatabase() {
    await clearTestDatabase();

    await prisma.video.create({
        data: {
            id: "sample-video-1",
            title: "Test lesson summary",
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=test-video",
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
