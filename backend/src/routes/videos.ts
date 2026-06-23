import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { prisma } from "../db";

type VideoParams = {
    Params: {
        videoId: string;
    };
};

type CreateVideoRequest = {
    Body: {
        title: string;
        sourceType: string;
        sourceUrl: string;
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

    const video = await prisma.video.create({
        data: {
            title,
            sourceType,
            sourceUrl,
        },
    });

    return reply.status(201).send(video);
}

async function updateVideoHandler(
    request: FastifyRequest<UpdateVideoRequest>,
    reply: FastifyReply
) {
    const existingVideo = await prisma.video.findUnique({
        where: {
            id: request.params.videoId,
        },
    });

    if (!existingVideo) {
        return reply.status(404).send({
            error: "Video not found",
        });
    }

    return prisma.video.update({
        where: {
            id: existingVideo.id,
        },
        data: request.body,
    });
}

async function deleteVideoHandler(
    request: FastifyRequest<VideoParams>,
    reply: FastifyReply
) {
    const existingVideo = await prisma.video.findUnique({
        where: {
            id: request.params.videoId,
        },
    });

    if (!existingVideo) {
        return reply.status(404).send({
            error: "Video not found",
        });
    }

    await prisma.video.delete({
        where: {
            id: existingVideo.id,
        },
    });

    return reply.status(204).send();
}

export function registerVideoRoutes(app: FastifyInstance) {
    app.get("/videos", async () => {
        const videos = await prisma.video.findMany({
            orderBy: {
                createdAt: "asc",
            },
        });

        return {
            videos,
        };
    });

    app.get<VideoParams>("/videos/:videoId", async (request, reply) => {
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

    app.get<VideoParams>(
        "/videos/:videoId/segments",
        async (request, reply) => {
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
        }
    );

    app.post<CreateVideoRequest>(
        "/videos",
        createVideoRouteOptions,
        createVideoHandler
    );
    app.patch<UpdateVideoRequest>(
        "/videos/:videoId",
        updateVideoRouteOptions,
        updateVideoHandler
    );
    app.delete<VideoParams>("/videos/:videoId", deleteVideoHandler);
}
