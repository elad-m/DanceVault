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
    getPracticeQueue,
    searchSegments,
} from "../services/segmentService";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import type { VideoDataAccess } from "../persistence/videoDataAccess";

type CreateSegmentRequest = {
    Params: {
        videoId: string;
    };
    Body: {
        name: string;
        description?: string;
        startMilliseconds: number;
        endMilliseconds: number;
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
        tags?: string[];
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
    };
};

const segmentMetadataProperties = {
    name: {
        type: "string",
        minLength: 1,
    },
    description: {
        type: "string",
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

const segmentTimestampProperties = {
    startMilliseconds: {
        type: "integer",
        minimum: 0,
    },
    endMilliseconds: {
        type: "integer",
        minimum: 1,
    },
} as const;

const createSegmentRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["name", "startMilliseconds", "endMilliseconds"],
            properties: {
                ...segmentMetadataProperties,
                ...segmentTimestampProperties,
            },
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
            properties: segmentMetadataProperties,
        },
    },
} as const;

async function createSegmentHandler(
    request: FastifyRequest<CreateSegmentRequest>,
    reply: FastifyReply,
    videoDataAccess: VideoDataAccess,
    segmentDataAccess: SegmentDataAccess
) {
    const video = await videoDataAccess.getVideoByID({
        videoID: request.params.videoId,
        userID: request.userId,
    });

    if (!video) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    const { name, startMilliseconds, endMilliseconds } = request.body;

    if (!areSegmentTimestampsValid(startMilliseconds, endMilliseconds)) {
        return sendApiError(reply, {
            statusCode: 400,
            code: ApiErrorCode.InvalidSegmentTimestamps,
        });
    }

    const segment = await createSegment({
        userId: request.userId,
        videoId: video.id,
        name,
        description: request.body.description,
        startMilliseconds,
        endMilliseconds,
        tags: request.body.tags,
        difficulty: request.body.difficulty,
        confidence: request.body.confidence,
        practicePriority: request.body.practicePriority,
        segmentDataAccess,
    });

    return reply.status(201).send(segment);
}

async function getSegmentHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply,
    segmentDataAccess: SegmentDataAccess
) {
    const segment = await segmentDataAccess.getSegmentByID({
        segmentID: request.params.segmentId,
        userID: request.userId,
    });

    if (!segment) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    return segment;
}

async function searchSegmentsHandler(
    request: FastifyRequest<SearchSegmentsRequest>,
    segmentDataAccess: SegmentDataAccess
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
        userId: request.userId,
        tag,
        difficulty,
        confidence,
        practicePriority,
        text,
        limit,
        cursor,
        segmentDataAccess,
    });

    return {
        segments,
        nextCursor,
    };
}

async function getPracticeQueueHandler(
    request: FastifyRequest<PracticeQueueRequest>,
    segmentDataAccess: SegmentDataAccess
) {
    const limit = request.query.limit ? Number(request.query.limit) : 20;
    const { items: segments, nextCursor } = await getPracticeQueue({
        userId: request.userId,
        limit,
        cursor: request.query.cursor,
        segmentDataAccess,
    });

    return {
        segments,
        nextCursor,
    };
}

async function updateSegmentHandler(
    request: FastifyRequest<UpdateSegmentRequest>,
    reply: FastifyReply,
    segmentDataAccess: SegmentDataAccess
) {
    const existingSegment = await segmentDataAccess.getSegmentByID({
        segmentID: request.params.segmentId,
        userID: request.userId,
    });

    if (!existingSegment) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    return segmentDataAccess.updateSegmentMetadata({
        segmentID: existingSegment.id,
        userID: request.userId,
        ...request.body,
    });
}

async function deleteSegmentHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply,
    segmentDataAccess: SegmentDataAccess
) {
    const existingSegment = await segmentDataAccess.getSegmentByID({
        segmentID: request.params.segmentId,
        userID: request.userId,
    });

    if (!existingSegment) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    await segmentDataAccess.deleteSegment({
        segmentID: existingSegment.id,
        videoID: existingSegment.videoId,
        userID: request.userId,
    });

    return reply.status(204).send();
}

export function registerSegmentRoutes(
    app: FastifyInstance,
    videoDataAccess: VideoDataAccess,
    segmentDataAccess: SegmentDataAccess
) {
    app.post<CreateSegmentRequest>(
        "/videos/:videoId/segments",
        createSegmentRouteOptions,
        (request, reply) =>
            createSegmentHandler(
                request,
                reply,
                videoDataAccess,
                segmentDataAccess
            )
    );
    app.get<SegmentParams>(
        "/segments/:segmentId",
        (request, reply) =>
            getSegmentHandler(
                request,
                reply,
                segmentDataAccess
            )
    );
    app.get<SearchSegmentsRequest>(
        "/segments",
        searchSegmentsRouteOptions,
        (request) =>
            searchSegmentsHandler(
                request,
                segmentDataAccess
            )
    );
    app.get<PracticeQueueRequest>(
        "/practice-queue",
        practiceQueueRouteOptions,
        (request) =>
            getPracticeQueueHandler(
                request,
                segmentDataAccess
            )
    );
    app.patch<UpdateSegmentRequest>(
        "/segments/:segmentId",
        updateSegmentRouteOptions,
        (request, reply) =>
            updateSegmentHandler(
                request,
                reply,
                segmentDataAccess
            )
    );
    app.delete<SegmentParams>("/segments/:segmentId", (request, reply) =>
        deleteSegmentHandler(
            request,
            reply,
            segmentDataAccess
        )
    );
}
