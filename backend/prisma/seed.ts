import { prisma } from "../src/db";

async function seed() {
    await prisma.video.upsert({
        where: {
            id: "sample-video-1",
        },
        update: {},
        create: {
            id: "sample-video-1",
            title: "Salsa lesson summary",
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=abc123",
            segments: {
                create: [
                    {
                        id: "sample-segment-1",
                        name: "Inside turn variation",
                        description: "Practice the timing and hand lead.",
                        startSeconds: 120,
                        endSeconds: 155,
                        tags: ["salsa", "turn", "partnerwork"],
                        difficulty: "medium",
                        confidence: "low",
                        practicePriority: "high",
                    },
                    {
                        id: "sample-segment-2",
                        name: "Wave in open stance",
                        description: "Upper-body wave while keeping the base grounded.",
                        startSeconds: 210,
                        endSeconds: 245,
                        tags: ["wave", "isolation", "open-stance"],
                        difficulty: "hard",
                        confidence: "medium",
                        practicePriority: "medium",
                    },
                    {
                        id: "sample-segment-3",
                        name: "Closed stance wave transition",
                        description: "Wave timing changes while switching stance.",
                        startSeconds: 300,
                        endSeconds: 338,
                        tags: ["wave", "transition", "closed-stance"],
                        difficulty: "very_hard",
                        confidence: "low",
                        practicePriority: "high",
                    },
                ],
            },
        },
    });
}

seed()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exitCode = 1;
    });
