import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { prisma } from "../db";
import {
    buildSegmentPlaybackUrl,
    confidenceSchema,
    difficultySchema,
    practicePrioritySchema,
} from "../domain/segment";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";

type SearchSegmentsRequest = {
    Querystring: {
        tag?: string;
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
        text?: string;
    };
};

type SegmentParams = {
    Params: {
        segmentId: string;
    };
};

type UpdateSegmentRequest = SegmentParams & {
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
};

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

type SegmentWithPlaybackSource = {
    startSeconds: number;
    video: {
        sourceType: string;
        sourceUrl: string;
    };
};

function toSegmentResponse<T extends SegmentWithPlaybackSource>(segment: T) {
    const { video, ...segmentData } = segment;

    return {
        ...segmentData,
        playbackUrl: buildSegmentPlaybackUrl(video, segment.startSeconds),
    };
}

const segmentProperties = {
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
} as const;

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

const updateSegmentRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            minProperties: 1,
            properties: segmentProperties,
        },
    },
} as const;

const createSegmentRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["name", "startSeconds", "endSeconds"],
            properties: segmentProperties,
        },
    },
} as const;

async function searchSegmentsHandler(
    request: FastifyRequest<SearchSegmentsRequest>
) {
    const { tag, difficulty, confidence, practicePriority, text } =
        request.query;

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
        include: {
            video: {
                select: {
                    sourceType: true,
                    sourceUrl: true,
                },
            },
        },
    });

    return {
        segments: results.map(toSegmentResponse),
    };
}

async function getSegmentHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply
) {
    const segment = await prisma.segment.findUnique({
        where: {
            id: request.params.segmentId,
        },
        include: {
            video: {
                select: {
                    sourceType: true,
                    sourceUrl: true,
                },
            },
        },
    });

    if (!segment) {
        return reply.status(404).send({
            error: "Segment not found",
        });
    }

    return toSegmentResponse(segment);
}

async function updateSegmentHandler(
    request: FastifyRequest<UpdateSegmentRequest>,
    reply: FastifyReply
) {
    const existingSegment = await prisma.segment.findUnique({
        where: {
            id: request.params.segmentId,
        },
        include: {
            video: {
                select: {
                    sourceType: true,
                    sourceUrl: true,
                },
            },
        },
    });

    if (!existingSegment) {
        return reply.status(404).send({
            error: "Segment not found",
        });
    }

    const nextStartSeconds =
        request.body.startSeconds ?? existingSegment.startSeconds;
    const nextEndSeconds =
        request.body.endSeconds ?? existingSegment.endSeconds;

    if (nextEndSeconds <= nextStartSeconds) {
        return reply.status(400).send({
            error: "endSeconds must be greater than startSeconds",
        });
    }

    const updatedSegment = await prisma.segment.update({
        where: {
            id: existingSegment.id,
        },
        data: request.body,
    });

    return toSegmentResponse({
        ...updatedSegment,
        video: existingSegment.video,
    });
}

async function deleteSegmentHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply
) {
    const existingSegment = await prisma.segment.findUnique({
        where: {
            id: request.params.segmentId,
        },
    });

    if (!existingSegment) {
        return reply.status(404).send({
            error: "Segment not found",
        });
    }

    await prisma.segment.delete({
        where: {
            id: existingSegment.id,
        },
    });

    return reply.status(204).send();
}

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

    return reply.status(201).send(
        toSegmentResponse({
            ...segment,
            video,
        })
    );
}

export function registerSegmentRoutes(app: FastifyInstance) {
    app.get<SearchSegmentsRequest>(
        "/segments",
        searchSegmentsRouteOptions,
        searchSegmentsHandler
    );
    app.get<SegmentParams>("/segments/:segmentId", getSegmentHandler);
    app.patch<UpdateSegmentRequest>(
        "/segments/:segmentId",
        updateSegmentRouteOptions,
        updateSegmentHandler
    );
    app.delete<SegmentParams>("/segments/:segmentId", deleteSegmentHandler);
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
            include: {
                video: {
                    select: {
                        sourceType: true,
                        sourceUrl: true,
                    },
                },
            },
        });

        return {
            segments: queue.map(toSegmentResponse),
        };
    });
    app.post<CreateSegmentRequest>(
        "/videos/:videoId/segments",
        createSegmentRouteOptions,
        createSegmentHandler
    );
}
