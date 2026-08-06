import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import {
    completeVideoUpload,
    createVideoPlaybackUrl,
    deleteVideoWithStorage,
    initializeVideoUpload,
} from "../services/videoService";
import {
    maxVideoUploadSizeBytes,
    supportedVideoContentTypeSchema,
    type SupportedVideoContentType,
} from "../domain/video";
import type { VideoStorageProvider } from "../storage";
import type { VideoDataAccess } from "../persistence/videoDataAccess";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";

type CreateVideoUploadRequest = {
    Body: {
        title: string;
        fileName: string;
        contentType: SupportedVideoContentType;
        fileSizeBytes: number;
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
} as const;

const createVideoUploadRouteOptions = {
    schema: {
        body: {
            type: "object",
            additionalProperties: false,
            required: [
                "title",
                "fileName",
                "contentType",
                "fileSizeBytes",
            ],
            properties: {
                title: videoProperties.title,
                fileName: {
                    type: "string",
                    minLength: 1,
                    maxLength: 255,
                    pattern: "^[^/\\\\]+\\.[mM][pP]4$",
                },
                contentType: supportedVideoContentTypeSchema,
                fileSizeBytes: {
                    type: "integer",
                    minimum: 1,
                    maximum: maxVideoUploadSizeBytes,
                },
            },
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

async function createVideoUploadHandler(
    request: FastifyRequest<CreateVideoUploadRequest>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    videoDataAccess: VideoDataAccess
) {
    const upload = await initializeVideoUpload({
        userId: request.userId,
        title: request.body.title,
        fileName: request.body.fileName,
        contentType: request.body.contentType,
        videoStorageProvider,
        videoDataAccess,
    });

    return reply.status(201).send({
        video: upload.video,
        uploadUrl: upload.uploadUrl,
    });
}

async function completeVideoUploadHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    videoDataAccess: VideoDataAccess
) {
    const result = await completeVideoUpload({
        videoId: request.params.videoId,
        userId: request.userId,
        videoStorageProvider,
        videoDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    if (result.kind === "invalid_upload_state") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.InvalidVideoUploadState,
        });
    }

    if (result.kind === "upload_object_missing") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.VideoUploadNotFound,
        });
    }

    if (result.kind === "upload_too_large") {
        return sendApiError(reply, {
            statusCode: 413,
            code: ApiErrorCode.VideoUploadTooLarge,
        });
    }

    return result.video;
}

async function getVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply,
    videoDataAccess: VideoDataAccess
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

    return video;
}

async function getVideoPlaybackUrlHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    videoDataAccess: VideoDataAccess
) {
    const result = await createVideoPlaybackUrl({
        videoId: request.params.videoId,
        userId: request.userId,
        videoStorageProvider,
        videoDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    if (result.kind === "invalid_upload_state") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.InvalidVideoUploadState,
        });
    }

    if (result.kind === "not_ready") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.VideoNotReady,
        });
    }

    return {
        playbackUrl: result.playbackUrl,
        expiresInSeconds: result.expiresInSeconds,
    };
}

async function listVideosHandler(
    request: FastifyRequest,
    videoDataAccess: VideoDataAccess
) {
    const videos = await videoDataAccess.listVideos({
        userID: request.userId,
    });

    return { videos };
}

async function getVideoSegmentsHandler(
    request: FastifyRequest<VideoParams>,
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

    const videoSegments =
        await segmentDataAccess.listSegmentsByVideo({
            videoID: request.params.videoId,
            userID: request.userId,
        });

    return {
        segments: videoSegments,
    };
}

async function updateVideoHandler(
    request: FastifyRequest<UpdateVideoRequest>,
    reply: FastifyReply,
    videoDataAccess: VideoDataAccess
) {
    const existingVideo = await videoDataAccess.getVideoByID({
        videoID: request.params.videoId,
        userID: request.userId,
    });

    if (!existingVideo) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    return videoDataAccess.updateVideoTitle({
        videoID: request.params.videoId,
        userID: request.userId,
        title: request.body.title!,
    });
}

async function deleteVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply,
    videoStorageProvider: VideoStorageProvider,
    videoDataAccess: VideoDataAccess,
    segmentDataAccess: SegmentDataAccess
) {
    const result = await deleteVideoWithStorage({
        videoId: request.params.videoId,
        userId: request.userId,
        videoStorageProvider,
        videoDataAccess,
        segmentDataAccess,
    });

    if (result.kind === "not_found") {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    if (result.kind === "invalid_upload_state") {
        return sendApiError(reply, {
            statusCode: 409,
            code: ApiErrorCode.InvalidVideoUploadState,
        });
    }

    return reply.status(204).send();
}

export function registerVideoRoutes(
    app: FastifyInstance,
    videoStorageProvider: VideoStorageProvider,
    videoDataAccess: VideoDataAccess,
    segmentDataAccess: SegmentDataAccess
) {
    app.post<CreateVideoUploadRequest>(
        "/video-uploads",
        createVideoUploadRouteOptions,
        (request, reply) =>
            createVideoUploadHandler(
                request,
                reply,
                videoStorageProvider,
                videoDataAccess
            )
    );
    app.post<VideoParams>(
        "/video-uploads/:videoId/complete",
        (request, reply) =>
            completeVideoUploadHandler(
                request,
                reply,
                videoStorageProvider,
                videoDataAccess
            )
    );
    app.get<VideoParams>(
        "/videos/:videoId",
        (request, reply) =>
            getVideoHandler(
                request,
                reply,
                videoDataAccess
            )
    );
    app.get<VideoParams>(
        "/videos/:videoId/playback-url",
        (request, reply) =>
            getVideoPlaybackUrlHandler(
                request,
                reply,
                videoStorageProvider,
                videoDataAccess
            )
    );
    app.get(
        "/videos",
        (request) =>
            listVideosHandler(
                request,
                videoDataAccess
            )
    );
    app.get<VideoParams>(
        "/videos/:videoId/segments",
        (request, reply) =>
            getVideoSegmentsHandler(
                request,
                reply,
                videoDataAccess,
                segmentDataAccess
            )
    );
    app.patch<UpdateVideoRequest>(
        "/videos/:videoId",
        updateVideoRouteOptions,
        (request, reply) =>
            updateVideoHandler(
                request,
                reply,
                videoDataAccess
            )
    );
    app.delete<VideoParams>(
        "/videos/:videoId",
        (request, reply) =>
            deleteVideoHandler(
                request,
                reply,
                videoStorageProvider,
                videoDataAccess,
                segmentDataAccess
            )
    );
}
