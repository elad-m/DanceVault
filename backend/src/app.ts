import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { ApiErrorCode, sendApiError } from "./httpErrors";
import { registerSegmentRoutes } from "./routes/segments";
import { registerMainListRoutes } from "./routes/mainList";
import { registerVideoRoutes } from "./routes/videos";
import { registerAccountRoutes } from "./routes/account";
import {
    createLiveAuthenticationDependencies,
    registerAuthentication,
} from "./auth/authentication";
import {
    createPersistenceProvider,
    type PersistenceProvider,
} from "./persistence";
import {
    createVideoStorageProvider,
    getActiveVideoStorageProviderName,
    type VideoStorageProvider,
} from "./storage";
import {
    createVideoDeletionQueue,
} from "./jobs/createVideoDeletionQueue";
import type {
    VideoDeletionQueue,
} from "./jobs/videoDeletionQueue";
import { registerAccountWriteGuard } from "./auth/accountWriteGuard";
import { createAccountDeletionQueue } from "./jobs/createAccountDeletionQueue";
import type { AccountDeletionQueue } from "./jobs/accountDeletionQueue";
import { registerLegalAcceptanceGuard } from "./auth/legalAcceptanceGuard";
import { createSegmentExportStorageProvider, type SegmentExportStorageProvider } from "./storage/segmentExportStorageProvider";
import { createDockerFFmpegSegmentExportProcessor } from "./media/dockerFFmpegSegmentExportProcessor";
import type { SegmentExportProcessor } from "./media/segmentExportProcessor";
import { createSegmentExportQueue } from "./jobs/createSegmentExportQueue";
import type { SegmentExportQueue } from "./jobs/segmentExportQueue";
import { registerSegmentExportRoutes } from "./routes/segmentExports";

type BuildAppOptions = {
    videoStorageProvider?: VideoStorageProvider;
    persistenceProvider?: PersistenceProvider;
    videoDeletionQueue?: VideoDeletionQueue;
    accountDeletionQueue?: AccountDeletionQueue;
    segmentExportStorageProvider?: SegmentExportStorageProvider;
    segmentExportProcessor?: SegmentExportProcessor;
    segmentExportQueue?: SegmentExportQueue;
};

export function buildApp(
    options: BuildAppOptions = {}
) {
    const videoStorageProvider =
        options.videoStorageProvider ??
        createVideoStorageProvider(
            getActiveVideoStorageProviderName()
        );

    const persistenceProvider =
        options.persistenceProvider ??
        createPersistenceProvider();

    const segmentExportStorageProvider =
        options.segmentExportStorageProvider ??
        createSegmentExportStorageProvider(
            getActiveVideoStorageProviderName()
        );

    const videoDeletionQueue =
        options.videoDeletionQueue ??
        createVideoDeletionQueue({
            videoStorageProvider,
            persistenceProvider,
            segmentExportStorageProvider,
        });

    const accountDeletionQueue =
        options.accountDeletionQueue ??
        createAccountDeletionQueue({
            videoStorageProvider,
            persistenceProvider,
            segmentExportStorageProvider,
        });
    const segmentExportProcessor =
        options.segmentExportProcessor ??
        createDockerFFmpegSegmentExportProcessor();
    const segmentExportQueue =
        options.segmentExportQueue ??
        createSegmentExportQueue({
            segmentExportDataAccess:
                persistenceProvider.segmentExportDataAccess,
            segmentExportStorageProvider,
            segmentExportProcessor,
        });

    const app = Fastify({
        logger: true,
        ajv: {
            customOptions: {
                coerceTypes: false,
                removeAdditional: false,
            },
        },
    });

    app.addHook("onClose", async () => {
        accountDeletionQueue.close();
        segmentExportQueue.close();
        segmentExportStorageProvider.close();
        videoDeletionQueue.close();
        videoStorageProvider.close();
        await persistenceProvider.close();
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
        if (error.validation) {
            return sendApiError(reply, {
                statusCode: 400,
                code: ApiErrorCode.ValidationError,
                message: error.message,
            });
        }

        request.log.error(
            {
                event: "request_failed",
                userId: request.userId || undefined,
                err: error,
            },
            "Unhandled request failure"
        );

        return sendApiError(reply, {
            statusCode: 500,
            code: ApiErrorCode.InternalServerError,
        });
    });

    app.get("/health", async () => {
        return { status: "ok" };
    });

    app.options("/*", async (_request, reply) => {
        return reply.status(204).send();
    });

    const authenticationDependencies =
        createLiveAuthenticationDependencies();
    registerAuthentication(app, authenticationDependencies);
    registerLegalAcceptanceGuard(
        app,
        persistenceProvider.userAccountDataAccess,
        authenticationDependencies.environment
    );
    registerAccountWriteGuard(
        app,
        persistenceProvider.userAccountDataAccess
    );
    registerVideoRoutes(
        app,
        videoStorageProvider,
        videoDeletionQueue,
        persistenceProvider.videoDataAccess,
        persistenceProvider.segmentDataAccess
    );
    registerSegmentRoutes(
        app,
        videoStorageProvider,
        persistenceProvider.videoDataAccess,
        persistenceProvider.segmentDataAccess,
        persistenceProvider.segmentExportDataAccess,
        segmentExportStorageProvider
    );
    registerMainListRoutes(app, persistenceProvider);
    registerSegmentExportRoutes(app, {
        segmentDataAccess: persistenceProvider.segmentDataAccess,
        videoDataAccess: persistenceProvider.videoDataAccess,
        segmentExportDataAccess:
            persistenceProvider.segmentExportDataAccess,
        segmentExportQueue,
        segmentExportStorageProvider,
    });
    registerAccountRoutes(
        app,
        persistenceProvider.userAccountDataAccess,
        accountDeletionQueue
    );

    return app;
}
