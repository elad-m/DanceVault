import { prisma } from "../src/db";

async function seed() {
    const user = await prisma.user.upsert({
        where: {
            id: "initial-user",
        },
        update: {},
        create: {
            id: "initial-user",
            email: "owner@dancevault.local",
        },
    });
    await prisma.video.upsert({
        where: {
            id: "sample-video-1",
        },
        update: {
            user: {
                connect: {
                    id: user.id,
                },
            },
        },
        create: {
            id: "sample-video-1",
            user: {
                connect: {
                    id: user.id,
                },
            },
            title: "Salsa lesson summary",
            sourceType: "youtube",
            sourceUrl: "https://youtube.com/watch?v=abc123",
            segments: {
                create: [
                    {
                        id: "sample-segment-1",
                        name: "Inside turn variation",
                        description: "Practice the timing and hand lead.",
                        startMilliseconds: 120000,
                        endMilliseconds: 155000,
                        tags: ["salsa", "turn", "partnerwork"],
                        difficulty: "medium",
                        confidence: "low",
                        practicePriority: "high",
                    },
                    {
                        id: "sample-segment-2",
                        name: "Wave in open stance",
                        description: "Upper-body wave while keeping the base grounded.",
                        startMilliseconds: 210000,
                        endMilliseconds: 245000,
                        tags: ["wave", "isolation", "open-stance"],
                        difficulty: "hard",
                        confidence: "medium",
                        practicePriority: "medium",
                    },
                    {
                        id: "sample-segment-3",
                        name: "Closed stance wave transition",
                        description: "Wave timing changes while switching stance.",
                        startMilliseconds: 300000,
                        endMilliseconds: 338000,
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
