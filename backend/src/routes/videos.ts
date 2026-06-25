import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { toSegmentResponse } from "../services/segmentService";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import {
    createVideo,
    deleteVideo,
    getVideoById,
    getVideoSegments,
    listVideos,
    updateVideo,
} from "../services/videoService";

type CreateVideoRequest = {
    Body: {
        title: string;
        sourceType: string;
        sourceUrl: string;
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
        sourceType?: string;
        sourceUrl?: string;
    };
};

const videoProperties = {
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
            properties: videoProperties,
        },
    },
} as const;

async function createVideoHandler(
    request: FastifyRequest<CreateVideoRequest>,
    reply: FastifyReply
) {
    const { title, sourceType, sourceUrl } = request.body;

    const video = await createVideo({ title, sourceType, sourceUrl });

    return reply.status(201).send(video);
}

async function getVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const video = await getVideoById(request.params.videoId);

    if (!video) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    return video;
}

async function listVideosHandler() {
    const videos = await listVideos();

    return {
        videos,
    };
}

async function getVideoSegmentsHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const video = await getVideoById(request.params.videoId);

    if (!video) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    const videoSegments = await getVideoSegments(request.params.videoId);

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
    const existingVideo = await getVideoById(request.params.videoId);

    if (!existingVideo) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    return updateVideo({
        videoId: request.params.videoId,
        ...request.body,
    });
}

async function deleteVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const existingVideo = await getVideoById(request.params.videoId);

    if (!existingVideo) {
        return sendApiError(reply, {
            statusCode: 404,
            code: ApiErrorCode.VideoNotFound,
        });
    }

    await deleteVideo(request.params.videoId);

    return reply.status(204).send();
}

export function registerVideoRoutes(app: FastifyInstance) {
    app.post<CreateVideoRequest>(
        "/videos",
        createVideoRouteOptions,
        createVideoHandler
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
