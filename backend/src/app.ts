import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { ApiErrorCode, sendApiError } from "./httpErrors";
import { registerSegmentRoutes } from "./routes/segments";
import { registerVideoRoutes } from "./routes/videos";

export function buildApp() {
    const app = Fastify({
        logger: true,
        ajv: {
            customOptions: {
                coerceTypes: false,
                removeAdditional: false,
            },
        },
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

    registerVideoRoutes(app);
    registerSegmentRoutes(app);

    return app;
}
