import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { ApiErrorCode, sendApiError } from "./httpErrors";
import { registerSegmentRoutes } from "./routes/segments";
import { registerVideoRoutes } from "./routes/videos";
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

type BuildAppOptions = {
    videoStorageProvider?: VideoStorageProvider;
    persistenceProvider?: PersistenceProvider;
};

export function buildApp({
    videoStorageProvider = createVideoStorageProvider(
        getActiveVideoStorageProviderName()
    ),
    persistenceProvider = createPersistenceProvider(),
}: BuildAppOptions = {}) {
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

    registerAuthentication(
        app,
        createLiveAuthenticationDependencies()
    );
    registerVideoRoutes(
        app,
        videoStorageProvider,
        persistenceProvider.videoDataAccess,
        persistenceProvider.segmentDataAccess
    );
    registerSegmentRoutes(
        app,
        persistenceProvider.videoDataAccess,
        persistenceProvider.segmentDataAccess
    );

    return app;
}
