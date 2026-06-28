import type { FastifyInstance } from "fastify";
import { ApiErrorCode, sendApiError } from "../httpErrors";

declare module "fastify" {
    interface FastifyRequest {
        userId: string;
    }
}

export function registerDevelopmentAuthentication(app: FastifyInstance) {
    app.decorateRequest("userId", "");

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