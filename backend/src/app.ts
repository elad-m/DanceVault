import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { ApiErrorCode, sendApiError } from "./httpErrors";
import { registerSegmentRoutes } from "./routes/segments";
import { registerVideoRoutes } from "./routes/videos";
import { registerDevelopmentAuthentication } from "./auth/developmentAuth";
import {
    createVideoStorageProvider,
    getActiveVideoStorageProviderName,
    type VideoStorageProvider,
} from "./storage";

type BuildAppOptions = {
    videoStorageProvider?: VideoStorageProvider;
};

export function buildApp({
    videoStorageProvider = createVideoStorageProvider(
        getActiveVideoStorageProviderName()
    ),
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

    app.addHook("onClose", () => {
        videoStorageProvider.close();
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
        if (error.validation) {
            return sendApiError(reply, {
                statusCode: 400,
                code: ApiErrorCode.ValidationError,
                message: error.message,
            });
        }

        request.log.error(error);

        return sendApiError(reply, {
            statusCode: 500,
            code: ApiErrorCode.InternalServerError,
        });
    });

    app.get("/health", async () => {
        return { status: "ok" };
    });

    registerDevelopmentAuthentication(app);
    registerVideoRoutes(app, videoStorageProvider);
    registerSegmentRoutes(app);

    return app;
}
