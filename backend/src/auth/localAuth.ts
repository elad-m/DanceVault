import type { FastifyInstance } from "fastify";
import { ApiErrorCode, sendApiError } from "../httpErrors";

export function registerLocalAuthentication(app: FastifyInstance) {

    app.addHook("preHandler", async (request, reply) => {
        if (request.url === "/health") {
            return;
        }

        const userId = request.headers["x-user-id"];

        if (typeof userId !== "string" || userId.trim().length === 0) {
            return sendApiError(reply, {
                statusCode: 401,
                code: ApiErrorCode.Unauthorized,
            });
        }

        request.userId = userId;
    });
}