import Fastify from "fastify";
import { prisma } from "./db";

export const app = Fastify({
    logger: true,
});

type Difficulty = "easy" | "medium" | "hard" | "very_hard";

type Confidence = "low" | "medium" | "high";

type PracticePriority = "low" | "medium" | "high";

app.get("/health", async () => {
    return { status: "ok" };
});

app.get("/videos", async () => {
    const videos = await prisma.video.findMany({
        orderBy: {
            createdAt: "asc",
        },
    })

    return {
        videos,
    };
});

app.get<{
    Params: {
        videoId: string;
    };
}>("/videos/:videoId", async (request, reply) => {

    const video = await prisma.video.findUnique({
        where: {
            id: request.params.videoId,
        },
    });

    if (!video) {
        return reply.status(404).send({
            error: "Video not found",
        });
    }

    return video;
});

app.get<{
    Params: {
        videoId: string;
    };
}>("/videos/:videoId/segments", async (request, reply) => {

    const video = await prisma.video.findUnique({
        where: {
            id: request.params.videoId,
        },
    });

    if (!video) {
        return reply.status(404).send({
            error: "Video not found",
        });
    }

    const videoSegments = await prisma.segment.findMany({
        where: {
            videoId: request.params.videoId,
        },
        orderBy: {
            startSeconds: "asc",
        },
    });

    return {
        segments: videoSegments,
    };
});

app.get<{
    Querystring: {
        tag?: string;
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
        text?: string;
    };
}>("/segments", async (request) => {

    const tag = request.query.tag;
    const difficulty = request.query.difficulty;
    const confidence = request.query.confidence;
    const practicePriority = request.query.practicePriority;
    const text = request.query.text;

    const results = await prisma.segment.findMany({
        where: {
            tags: tag
                ? {
                    has: tag,
                }
                : undefined,
            difficulty,
            confidence,
            practicePriority,
            OR: text
                ? [
                    {
                        name: {
                            contains: text,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: text,
                            mode: "insensitive",
                        },
                    },
                ]
                : undefined,
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    return {
        segments: results,
    };
});

app.get("/practice-queue", async () => {
    const queue = await prisma.segment.findMany({
        orderBy: [
            {
                practicePriority: "desc",
            },
            {
                createdAt: "asc",
            },
        ],
    });

    return {
        segments: queue,
    };
});

app.post<{
    Body: {
        title?: string;
        sourceType?: string;
        sourceUrl?: string;
    };
}>("/videos", async (request, reply) => {
    const { title, sourceType, sourceUrl } = request.body;

    if (!title || !sourceType || !sourceUrl) {
        return reply.status(400).send({
            error: "title, sourceType, and sourceUrl are required",
        });
    }

    const video = await prisma.video.create({
        data: {
            title,
            sourceType,
            sourceUrl,
        },
    });

    return reply.status(201).send(video);
});

app.post<{
    Params: {
        videoId: string;
    };
    Body: {
        name?: string;
        description?: string;
        startSeconds?: number;
        endSeconds?: number;
        tags?: string[];
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
    };
}>("/videos/:videoId/segments", async (request, reply) => {
    const video = await prisma.video.findUnique({
        where: {
            id: request.params.videoId,
        },
    });

    if (!video) {
        return reply.status(404).send({
            error: "Video not found",
        });
    }

    const { name, startSeconds, endSeconds } = request.body;
    if (!name || startSeconds === undefined || endSeconds === undefined) {
        return reply.status(400).send({
            error: "name, startSeconds, and endSeconds are required",
        });
    }
    if (endSeconds <= startSeconds) {
        return reply.status(400).send({
            error: "endSeconds must be greater than startSeconds",
        });
    }

    const segment = await prisma.segment.create({
        data: {
            videoId: video.id,
            name,
            description: request.body.description,
            startSeconds,
            endSeconds,
            tags: request.body.tags ?? [],
            difficulty: request.body.difficulty ?? "medium",
            confidence: request.body.confidence ?? "medium",
            practicePriority: request.body.practicePriority ?? "medium",
        },
    });

    return reply.status(201).send(segment);
});
