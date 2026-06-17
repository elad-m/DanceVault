import Fastify from "fastify";
import { randomUUID } from "node:crypto";

const app = Fastify({
    logger: true,
});

type Video = {
    id: string;
    title: string;
    sourceType: string;
    sourceUrl: string;
    createdAt: string;
};

type Difficulty = "easy" | "medium" | "hard" | "very_hard";

type Confidence = "low" | "medium" | "high";

type PracticePriority = "low" | "medium" | "high";

type Segment = {
    id: string;
    videoId: string;
    name: string;
    description?: string;
    startSeconds: number;
    endSeconds: number;
    tags: string[];
    difficulty: Difficulty;
    confidence: Confidence;
    practicePriority: PracticePriority;
    createdAt: string;
};

const videos: Video[] = [
    {
        id: "sample-video-1",
        title: "Salsa lesson summary",
        sourceType: "youtube",
        sourceUrl: "https://youtube.com/watch?v=abc123",
        createdAt: new Date().toISOString(),
    },
];

const segments: Segment[] = [
    {
        id: "sample-segment-1",
        videoId: "sample-video-1",
        name: "Inside turn variation",
        description: "Practice the timing and hand lead.",
        startSeconds: 120,
        endSeconds: 155,
        tags: ["salsa", "turn", "partnerwork"],
        difficulty: "medium",
        confidence: "low",
        practicePriority: "high",
        createdAt: new Date().toISOString(),
    },
];

app.get("/health", async () => {
    return { status: "ok" };
});

app.get("/videos", async () => {
    return {
        videos,
    };
});

app.get<{
    Params: {
        videoId: string;
    };
}>("/videos/:videoId", async (request, reply) => {
    const video = videos.find((item) => item.id === request.params.videoId);

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
    const video = videos.find((item) => item.id === request.params.videoId);

    if (!video) {
        return reply.status(404).send({
            error: "Video not found",
        });
    }

    const videoSegments = segments.filter(
        (segment) => segment.videoId === request.params.videoId
    );

    return {
        segments: videoSegments,
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

    const video: Video = {
        id: randomUUID(),
        title,
        sourceType,
        sourceUrl,
        createdAt: new Date().toISOString(),
    };

    videos.push(video);

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
    const video = videos.find((item) => item.id === request.params.videoId);

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

    const segment: Segment = {
        id: randomUUID(),
        videoId: video.id,
        name,
        description: request.body.description,
        startSeconds,
        endSeconds,
        tags: request.body.tags || [],
        difficulty: request.body.difficulty || "medium",
        confidence: request.body.confidence || "medium",
        practicePriority: request.body.practicePriority || "medium",
        createdAt: new Date().toISOString(),
    };

    segments.push(segment);

    return reply.status(201).send(segment);
});

async function start() {
    await app.listen({ port: 3000 });
}

start();
