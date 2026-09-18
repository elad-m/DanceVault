import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import type { SegmentExportQueue } from "../jobs/segmentExportQueue";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import type { VideoDataAccess } from "../persistence/videoDataAccess";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import {
    getSegmentExport,
    getSegmentExportDownloadUrl,
    requestSegmentExport,
} from "../services/segmentExportService";

type SegmentExportParams = {
    Params: { segmentId: string };
};

function serializeExport(exportItem: NonNullable<Awaited<ReturnType<typeof getSegmentExport>>>) {
    return {
        id: exportItem.id,
        segmentId: exportItem.segmentId,
        videoId: exportItem.videoId,
        status: exportItem.status,
        failureMessage: exportItem.failureMessage ?? null,
        outputSizeBytes: exportItem.outputSizeBytes ?? null,
        createdAt: exportItem.createdAt.toISOString(),
        updatedAt: exportItem.updatedAt.toISOString(),
    };
}

export function registerSegmentExportRoutes(
    app: FastifyInstance,
    dependencies: {
        segmentDataAccess: SegmentDataAccess;
        videoDataAccess: VideoDataAccess;
        segmentExportDataAccess: SegmentExportDataAccess;
        segmentExportQueue: SegmentExportQueue;
        segmentExportStorageProvider: SegmentExportStorageProvider;
    }
) {
    app.post<SegmentExportParams>(
        "/segments/:segmentId/export",
        async (request, reply) => {
            const result = await requestSegmentExport({
                userID: request.userId,
                segmentID: request.params.segmentId,
                ...dependencies,
            });

            if (result.kind === "not_found") {
                return sendApiError(reply, {
                    statusCode: 404,
                    code: ApiErrorCode.SegmentNotFound,
                });
            }

            if (result.kind === "video_not_ready") {
                return sendApiError(reply, {
                    statusCode: 409,
                    code: ApiErrorCode.VideoNotReady,
                });
            }

            if (result.kind === "too_long") {
                return sendApiError(reply, {
                    statusCode: 400,
                    code: ApiErrorCode.SegmentExportTooLong,
                });
            }

            if (result.kind === "busy") {
                return sendApiError(reply, {
                    statusCode: 409,
                    code: ApiErrorCode.SegmentExportBusy,
                });
            }

            return reply
                .status(result.kind === "created" ? 202 : 200)
                .send(serializeExport(result.export));
        }
    );

    app.get<SegmentExportParams>(
        "/segments/:segmentId/export",
        async (request, reply) => {
            const exportItem = await getSegmentExport({
                userID: request.userId,
                segmentID: request.params.segmentId,
                segmentExportDataAccess:
                    dependencies.segmentExportDataAccess,
            });

            if (!exportItem) {
                return sendApiError(reply, {
                    statusCode: 404,
                    code: ApiErrorCode.SegmentExportNotFound,
                });
            }

            return serializeExport(exportItem);
        }
    );

    app.get<SegmentExportParams>(
        "/segments/:segmentId/export/download-url",
        async (request, reply) => {
            const result = await getSegmentExportDownloadUrl({
                userID: request.userId,
                segmentID: request.params.segmentId,
                segmentExportDataAccess:
                    dependencies.segmentExportDataAccess,
                segmentExportStorageProvider:
                    dependencies.segmentExportStorageProvider,
            });

            if (result.kind === "not_found") {
                return sendApiError(reply, {
                    statusCode: 404,
                    code: ApiErrorCode.SegmentExportNotFound,
                });
            }

            if (result.kind === "not_ready") {
                return sendApiError(reply, {
                    statusCode: 409,
                    code: ApiErrorCode.SegmentExportNotReady,
                });
            }

            return {
                downloadUrl: result.downloadUrl,
                expiresInSeconds: 15 * 60,
            };
        }
    );
}
