import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import {
    confidenceSchema,
    difficultySchema,
    practicePrioritySchema,
} from "../domain/segment";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";
import {
    areSegmentTimestampsValid,
    createSegment,
    deleteSegment,
    findSegmentForDeletion,
    findVideoForSegmentCreation,
    getPracticeQueue,
    getSegmentById,
    searchSegments,
    toSegmentResponse,
    updateSegment,
} from "../services/segmentService";

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

type SearchSegmentsRequest = {
    Querystring: {
        tag?: string;
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
        text?: string;
        limit?: string;
        cursor?: string;
    };
};

type PracticeQueueRequest = {
    Querystring: {
        limit?: string;
        cursor?: string;
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

const paginationQueryProperties = {
    limit: {
        type: "string",
        pattern: "^([1-9]|[1-4][0-9]|50)$",
    },
    cursor: {
        type: "string",
        minLength: 1,
    },
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
                ...paginationQueryProperties,
            },
        },
    },
} as const;

const practiceQueueRouteOptions = {
    schema: {
        querystring: {
            type: "object",
            additionalProperties: false,
            properties: paginationQueryProperties,
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

async function createSegmentHandler(
    request: FastifyRequest<CreateSegmentRequest>,
    reply: FastifyReply
) {
    const video = await findVideoForSegmentCreation(request.params.videoId);

    if (!video) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    const { name, startSeconds, endSeconds } = request.body;

    if (!areSegmentTimestampsValid(startSeconds, endSeconds)) {
        return sendApiError(reply, {
            statusCode: 400,
            code: ApiErrorCode.InvalidSegmentTimestamps,
        });
    }

    const segment = await createSegment({
        videoId: video.id,
        name,
        description: request.body.description,
        startSeconds,
        endSeconds,
        tags: request.body.tags,
        difficulty: request.body.difficulty,
        confidence: request.body.confidence,
        practicePriority: request.body.practicePriority,
    });

    return reply.status(201).send(
        toSegmentResponse({
            ...segment,
            video,
        })
    );
}

async function getSegmentHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply
) {
    const segment = await getSegmentById(request.params.segmentId);

    if (!segment) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    return toSegmentResponse(segment);
}

async function searchSegmentsHandler(
    request: FastifyRequest<SearchSegmentsRequest>
) {
    const {
        tag,
        difficulty,
        confidence,
        practicePriority,
        text,
        cursor,
    } = request.query;
    const limit = request.query.limit ? Number(request.query.limit) : 20;
    const { items: segments, nextCursor } = await searchSegments({
        tag,
        difficulty,
        confidence,
        practicePriority,
        text,
        limit,
        cursor,
    });

    return {
        segments: segments.map(toSegmentResponse),
        nextCursor,
    };
}

async function getPracticeQueueHandler(
    request: FastifyRequest<PracticeQueueRequest>
) {
    const limit = request.query.limit ? Number(request.query.limit) : 20;
    const { items: segments, nextCursor } = await getPracticeQueue({
        limit,
        cursor: request.query.cursor,
    });

    return {
        segments: segments.map(toSegmentResponse),
        nextCursor,
    };
}

async function updateSegmentHandler(
    request: FastifyRequest<UpdateSegmentRequest>,
    reply: FastifyReply
) {
    const existingSegment = await getSegmentById(request.params.segmentId);

    if (!existingSegment) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    const nextStartSeconds =
        request.body.startSeconds ?? existingSegment.startSeconds;
    const nextEndSeconds =
        request.body.endSeconds ?? existingSegment.endSeconds;

    if (!areSegmentTimestampsValid(nextStartSeconds, nextEndSeconds)) {
        return sendApiError(reply, {
            statusCode: 400,
            code: ApiErrorCode.InvalidSegmentTimestamps,
        });
    }

    const updatedSegment = await updateSegment({
        segmentId: existingSegment.id,
        ...request.body,
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
    const existingSegment = await findSegmentForDeletion(
        request.params.segmentId
    );

    if (!existingSegment) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    await deleteSegment(existingSegment.id);

    return reply.status(204).send();
}

export function registerSegmentRoutes(app: FastifyInstance) {
    app.post<CreateSegmentRequest>(
        "/videos/:videoId/segments",
        createSegmentRouteOptions,
        createSegmentHandler
    );
    app.get<SegmentParams>("/segments/:segmentId", getSegmentHandler);
    app.get<SearchSegmentsRequest>(
        "/segments",
        searchSegmentsRouteOptions,
        searchSegmentsHandler
    );
    app.get<PracticeQueueRequest>(
        "/practice-queue",
        practiceQueueRouteOptions,
        getPracticeQueueHandler
    );
    app.patch<UpdateSegmentRequest>(
        "/segments/:segmentId",
        updateSegmentRouteOptions,
        updateSegmentHandler
    );
    app.delete<SegmentParams>("/segments/:segmentId", deleteSegmentHandler);
}
