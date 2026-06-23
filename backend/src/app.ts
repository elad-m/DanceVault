import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db";

export const app = Fastify({
    logger: true,
    ajv: {
        customOptions: {
            coerceTypes: false,
            removeAdditional: false,
        },
    },
});

type Difficulty = "easy" | "medium" | "hard" | "very_hard";

type Confidence = "low" | "medium" | "high";

type PracticePriority = "low" | "medium" | "high";

const difficultySchema = {
    type: "string",
    enum: ["easy", "medium", "hard", "very_hard"],
} as const;

const confidenceSchema = {
    type: "string",
    enum: ["low", "medium", "high"],
} as const;

const practicePrioritySchema = {
    type: "string",
    enum: ["low", "medium", "high"],
} as const;

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

type SearchSegmentsRequest = {
    Querystring: {
        tag?: string;
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
        text?: string;
    };
};

const searchSegmentsRoute = "/segments";

const searchSegmentsRouteOptions = {
    schema: {
        querystring: {
            type: "object",
            additionalProperties: false,
            properties: {
                tag: {
                    type: "string",
                },
                text: {
                    type: "string",
                },
                difficulty: difficultySchema,
                confidence: confidenceSchema,
                practicePriority: practicePrioritySchema,
            },
        },
    },
} as const;

async function searchSegmentsHandler(
    request: FastifyRequest<SearchSegmentsRequest>
) {
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
}

app.get<SearchSegmentsRequest>(
    searchSegmentsRoute,
    searchSegmentsRouteOptions,
    searchSegmentsHandler
);

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

type CreateVideoRequest = {
    Body: {
        title: string;
        sourceType: string;
        sourceUrl: string;
    };
};

const createVideoRoute = "/videos";

const createVideoRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["title", "sourceType", "sourceUrl"],
            properties: {
                title: {
                    type: "string",
                    minLength: 1,
                },
                sourceType: {
                    type: "string",
                    minLength: 1,
                },
                sourceUrl: {
                    type: "string",
                    minLength: 1,
                },
            },
        },
    },
} as const;

async function createVideoHandler(
    request: FastifyRequest<CreateVideoRequest>,
    reply: FastifyReply
) {
    const { title, sourceType, sourceUrl } = request.body;

    const video = await prisma.video.create({
        data: {
            title,
            sourceType,
            sourceUrl,
        },
    });

    return reply.status(201).send(video);
}

app.post<CreateVideoRequest>(
    createVideoRoute,
    createVideoRouteOptions,
    createVideoHandler
);

type CreateSegmentRequest = {
    Params: {
        videoId: string;
    };
    Body: {
        name: string;
        description?: string;
        startSeconds: number;
        endSeconds: number;
        tags?: string[];
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
    };
};

const createSegmentRoute = "/videos/:videoId/segments";
const createSegmentRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["name", "startSeconds", "endSeconds"],
            properties: {
                name: {
                    type: "string",
                    minLength: 1,
                },
                description: {
                    type: "string",
                },
                startSeconds: {
                    type: "integer",
                    minimum: 0,
                },
                endSeconds: {
                    type: "integer",
                    minimum: 1,
                },
                tags: {
                    type: "array",
                    items: {
                        type: "string",
                    },
                },
                difficulty: difficultySchema,
                confidence: confidenceSchema,
                practicePriority: practicePrioritySchema,
            },
        },
    },
} as const;
async function createSegmentHandler(
    request: FastifyRequest<CreateSegmentRequest>,
    reply: FastifyReply
) {
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
}
app.post<CreateSegmentRequest>(
    createSegmentRoute,
    createSegmentRouteOptions,
    createSegmentHandler
);
