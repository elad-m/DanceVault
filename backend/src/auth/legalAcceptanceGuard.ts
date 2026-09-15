import type { FastifyInstance } from "fastify";
import {
    isCurrentLegalAcceptance,
} from "../domain/legalAcceptance";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";

const legalAcceptanceRoute = "/account/legal-acceptance";

export function registerLegalAcceptanceGuard(
    app: FastifyInstance,
    userAccountDataAccess: UserAccountDataAccess,
    environment: "local" | "dev"
) {
    if (environment === "local") {
        return;
    }

    const usersWithCurrentAcceptance = new Set<string>();

    app.addHook("preHandler", async (request, reply) => {
        if (
            request.method === "OPTIONS" ||
            request.routeOptions.url === "/health" ||
            request.routeOptions.url === legalAcceptanceRoute ||
            (request.method === "DELETE" &&
                request.routeOptions.url === "/account")
        ) {
            return;
        }

        if (usersWithCurrentAcceptance.has(request.userId)) {
            return;
        }

        const acceptance =
            await userAccountDataAccess.getUserLegalAcceptance({
                userID: request.userId,
            });

        if (!isCurrentLegalAcceptance(acceptance)) {
            return sendApiError(reply, {
                statusCode: 428,
                code: ApiErrorCode.LegalAcceptanceRequired,
            });
        }

        usersWithCurrentAcceptance.add(request.userId);
    });
}
