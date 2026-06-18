import Fastify from "fastify";
import { randomUUID } from "node:crypto";

export const app = Fastify({
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
        createdAt: "2026-06-01T10:00:00.000Z",
    },
    {
        id: "sample-segment-2",
        videoId: "sample-video-1",
        name: "Wave in open stance",
        description: "Upper-body wave while keeping the base grounded.",
        startSeconds: 210,
        endSeconds: 245,
        tags: ["wave", "isolation", "open-stance"],
        difficulty: "hard",
        confidence: "medium",
        practicePriority: "medium",
        createdAt: "2026-06-02T10:00:00.000Z",
    },
    {
        id: "sample-segment-3",
        videoId: "sample-video-1",
        name: "Closed stance wave transition",
        description: "Wave timing changes while switching stance.",
        startSeconds: 300,
        endSeconds: 338,
        tags: ["wave", "transition", "closed-stance"],
        difficulty: "very_hard",
        confidence: "low",
        practicePriority: "high",
        createdAt: "2026-06-03T10:00:00.000Z",
    },
    {
        id: "sample-segment-4",
        videoId: "sample-video-1",
        name: "Basic cross-body lead",
        description: "Clean up timing and frame.",
        startSeconds: 410,
        endSeconds: 448,
        tags: ["salsa", "basic", "partnerwork"],
        difficulty: "easy",
        confidence: "high",
        practicePriority: "low",
        createdAt: "2026-06-04T10:00:00.000Z",
    },
];

const priorityRank: Record<PracticePriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
};

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

app.get<{
    Querystring: {
        tag?: string;
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
        text?: string;
    };
}>("/segments", async (request) => {
    let results = segments;

    const tag = request.query.tag;
    const difficulty = request.query.difficulty;
    const confidence = request.query.confidence;
    const practicePriority = request.query.practicePriority;
    const text = request.query.text;

    if (tag) {
        results = results.filter((segment) => segment.tags.includes(tag));
    }

    if (difficulty) {
        results = results.filter((segment) => segment.difficulty === difficulty);
    }

    if (confidence) {
        results = results.filter((segment) => segment.confidence === confidence);
    }

    if (practicePriority) {
        results = results.filter(
            (segment) => segment.practicePriority === practicePriority
        );
    }

    if (text) {
        const normalizedText = text.toLowerCase();

        results = results.filter((segment) => {
            return (
                segment.name.toLowerCase().includes(normalizedText) ||
                segment.description?.toLowerCase().includes(normalizedText)
            );
        });
    }

    return {
        segments: results,
    };
});

app.get("/practice-queue", async () => {
    const queue = [...segments].sort((a, b) => {
        const priorityDifference =
            priorityRank[b.practicePriority] - priorityRank[a.practicePriority];

        if (priorityDifference !== 0) {
            return priorityDifference;
        }

        return a.createdAt.localeCompare(b.createdAt);
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
