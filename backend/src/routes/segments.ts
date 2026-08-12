import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import {
    confidenceSchema,
    difficultySchema,
    maxSegmentThumbnailSizeBytes,
    practicePrioritySchema,
    segmentThumbnailContentType,
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
    initializeSegmentThumbnailUpload,
    completeSegmentThumbnailUpload,
    getSegmentThumbnailPlaybackUrl,
    deleteSegmentWithThumbnail,
} from "../services/segmentService";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import type { VideoDataAccess } from "../persistence/videoDataAccess";
import type { VideoStorageProvider } from "../storage";

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

type CreateSegmentThumbnailUploadRequest = SegmentParams & {
    Body: {
        fileSizeBytes: number;
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

const createSegmentThumbnailUploadRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["fileSizeBytes"],
            properties: {
                fileSizeBytes: {
                    type: "integer",
                    minimum: 1,
                    maximum: maxSegmentThumbnailSizeBytes,
                },
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

async function initializeSegmentThumbnailUploadHandler(
    request: FastifyRequest<CreateSegmentThumbnailUploadRequest>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    segmentDataAccess: SegmentDataAccess
) {
    const result = await initializeSegmentThumbnailUpload({
        userId: request.userId,
        segmentId: request.params.segmentId,
        videoStorageProvider,
        segmentDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    return {
        uploadUrl: result.uploadUrl,
        contentType: segmentThumbnailContentType,
        expiresInSeconds: result.expiresInSeconds,
    };
}

async function completeSegmentThumbnailUploadHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    segmentDataAccess: SegmentDataAccess
) {
    const result = await completeSegmentThumbnailUpload({
        userId: request.userId,
        segmentId: request.params.segmentId,
        videoStorageProvider,
        segmentDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    if (result.kind === "upload_object_missing") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.SegmentThumbnailUploadNotFound,
        });
    }

    if (result.kind === "upload_too_large") {
        return sendApiError(reply, {
            statusCode: 413,
            code: ApiErrorCode.SegmentThumbnailUploadTooLarge,
        });
    }

    return reply.status(204).send();
}

async function getSegmentThumbnailPlaybackUrlHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    segmentDataAccess: SegmentDataAccess
) {
    const result = await getSegmentThumbnailPlaybackUrl({
        userId: request.userId,
        segmentId: request.params.segmentId,
        videoStorageProvider,
        segmentDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    if (result.kind === "thumbnail_missing") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentThumbnailNotFound,
        });
    }

    return {
        playbackUrl: result.playbackUrl,
        expiresInSeconds: result.expiresInSeconds,
    };
}

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

    if (video.status === "deleting") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.VideoDeleting,
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

    request.log.info(
        {
            event: "segment_created",
            userId: request.userId,
            videoId: video.id,
            segmentId: segment.id,
        },
        "Segment created"
    );

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

    const updatedSegment = await segmentDataAccess.updateSegmentMetadata({
        segmentID: existingSegment.id,
        userID: request.userId,
        ...request.body,
    });

    request.log.info(
        {
            event: "segment_updated",
            userId: request.userId,
            videoId: existingSegment.videoId,
            segmentId: existingSegment.id,
        },
        "Segment updated"
    );

    return updatedSegment;
}

async function deleteSegmentHandler(
    request: FastifyRequest<SegmentParams>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    segmentDataAccess: SegmentDataAccess
) {
    const result = await deleteSegmentWithThumbnail({
        userId: request.userId,
        segmentId: request.params.segmentId,
        videoStorageProvider,
        segmentDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.SegmentNotFound,
        });
    }

    request.log.info(
        {
            event: "segment_deleted",
            userId: request.userId,
            segmentId: request.params.segmentId,
        },
        "Segment and thumbnail deleted"
    );

    return reply.status(204).send();
}

export function registerSegmentRoutes(
    app: FastifyInstance,
    videoStorageProvider: VideoStorageProvider,
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
    app.delete<SegmentParams>(
        "/segments/:segmentId",
        (request, reply) =>
            deleteSegmentHandler(
                request,
                reply,
                videoStorageProvider,
                segmentDataAccess
            )
    );
    app.post<CreateSegmentThumbnailUploadRequest>(
        "/segments/:segmentId/thumbnail-upload",
        createSegmentThumbnailUploadRouteOptions,
        (request, reply) =>
            initializeSegmentThumbnailUploadHandler(
                request,
                reply,
                videoStorageProvider,
                segmentDataAccess
            )
    );
    app.post<SegmentParams>(
        "/segments/:segmentId/thumbnail-upload/complete",
        (request, reply) =>
            completeSegmentThumbnailUploadHandler(
                request,
                reply,
                videoStorageProvider,
                segmentDataAccess
            )
    );
    app.get<SegmentParams>(
        "/segments/:segmentId/thumbnail-playback-url",
        (request, reply) =>
            getSegmentThumbnailPlaybackUrlHandler(
                request,
                reply,
                videoStorageProvider,
                segmentDataAccess
            )
    );
}
