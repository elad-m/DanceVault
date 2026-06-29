import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { randomUUID } from "node:crypto";
import { toSegmentResponse } from "../services/segmentService";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import {
    createPendingUploadVideo,
    createVideo,
    deleteVideo,
    getVideoById,
    getVideoSegments,
    listVideos,
    updateVideo,
} from "../services/videoService";
import {
    createVideoStorageKey,
    externalVideoSourceTypeSchema,
    supportedVideoContentTypeSchema,
    type ExternalVideoSourceType,
    type SupportedVideoContentType,
} from "../domain/video";

type CreateVideoRequest = {
    Body: {
        title: string;
        sourceType: ExternalVideoSourceType;
        sourceUrl: string;
    };
};

type CreateVideoUploadRequest = {
    Body: {
        title: string;
        fileName: string;
        contentType: SupportedVideoContentType;
    };
};

type VideoParams = {
    Params: {
        videoId: string;
    };
};

type UpdateVideoRequest = VideoParams & {
    Body: {
        title?: string;
    };
};

const videoProperties = {
    title: {
        type: "string",
        minLength: 1,
    },
    sourceType: externalVideoSourceTypeSchema,
    sourceUrl: {
        type: "string",
        minLength: 1,
    },
} as const;

const createVideoUploadRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["title", "fileName", "contentType"],
            properties: {
                title: videoProperties.title,
                fileName: {
                    type: "string",
                    minLength: 1,
                    maxLength: 255,
                },
                contentType: supportedVideoContentTypeSchema,
            },
        },
    },
} as const;

const createVideoRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: ["title", "sourceType", "sourceUrl"],
            properties: videoProperties,
        },
    },
} as const;

const updateVideoRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            minProperties: 1,
            properties: {
                title: videoProperties.title,
            },
        },
    },
} as const;

async function createVideoHandler(
    request: FastifyRequest<CreateVideoRequest>,
    reply: FastifyReply
) {
    const { title, sourceType, sourceUrl } = request.body;

    const video = await createVideo({
        userId: request.userId,
        title,
        sourceType,
        sourceUrl,
    });

    return reply.status(201).send(video);
}

async function createVideoUploadHandler(
    request: FastifyRequest<CreateVideoUploadRequest>,
    reply: FastifyReply
) {
    const uploadId = randomUUID();
    const storageKey = createVideoStorageKey({
        userId: request.userId,
        uploadId,
        contentType: request.body.contentType,
    });
    const video = await createPendingUploadVideo({
        userId: request.userId,
        title: request.body.title,
        storageKey,
    });

    return reply.status(201).send(video);
}

async function getVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const video = await getVideoById({
        videoId: request.params.videoId,
        userId: request.userId,
    });

    if (!video) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    return video;
}

async function listVideosHandler(request: FastifyRequest) {
    const videos = await listVideos({
        userId: request.userId,
    });

    return { videos };
}

async function getVideoSegmentsHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const video = await getVideoById({
        videoId: request.params.videoId,
        userId: request.userId,
    });

    if (!video) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    const videoSegments = await getVideoSegments({
        videoId: request.params.videoId,
        userId: request.userId,
    });

    return {
        segments: videoSegments.map((segment) =>
            toSegmentResponse({
                ...segment,
                video,
            })
        ),
    };
}

async function updateVideoHandler(
    request: FastifyRequest<UpdateVideoRequest>,
    reply: FastifyReply
) {
    const existingVideo = await getVideoById({
        videoId: request.params.videoId,
        userId: request.userId,
    });

    if (!existingVideo) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    return updateVideo({
        videoId: request.params.videoId,
        userId: request.userId,
        ...request.body,
    });
}

async function deleteVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const existingVideo = await getVideoById({
        videoId: request.params.videoId,
        userId: request.userId,
    });

    if (!existingVideo) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    await deleteVideo({
        videoId: request.params.videoId,
        userId: request.userId,
    });

    return reply.status(204).send();
}

export function registerVideoRoutes(app: FastifyInstance) {
    app.post<CreateVideoRequest>(
        "/videos",
        createVideoRouteOptions,
        createVideoHandler
    );
    app.post<CreateVideoUploadRequest>(
        "/video-uploads",
        createVideoUploadRouteOptions,
        createVideoUploadHandler
    );
    app.get<VideoParams>("/videos/:videoId", getVideoHandler);
    app.get("/videos", listVideosHandler);
    app.get<VideoParams>("/videos/:videoId/segments", getVideoSegmentsHandler);
    app.patch<UpdateVideoRequest>(
        "/videos/:videoId",
        updateVideoRouteOptions,
        updateVideoHandler
    );
    app.delete<VideoParams>("/videos/:videoId", deleteVideoHandler);
}
