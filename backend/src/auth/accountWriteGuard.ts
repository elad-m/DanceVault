import type { FastifyInstance } from "fastify";
import { getUserAccountStatus } from "../domain/userAccount";
import { ApiErrorCode, sendApiError } from "../httpErrors";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";

const mutatingMethods = new Set([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
]);

export function registerAccountWriteGuard(
    app: FastifyInstance,
    userAccountDataAccess: UserAccountDataAccess
) {
    app.addHook("preHandler", async (request, reply) => {
        if (!mutatingMethods.has(request.method)) {
            return;
        }

        if (
            request.method === "DELETE" &&
            request.routeOptions.url === "/account"
        ) {
            return;
        }

        const lifecycle =
            await userAccountDataAccess.getUserAccountLifecycle({
                userID: request.userId,
            });

        if (getUserAccountStatus(lifecycle) !== "active") {
            return sendApiError(reply, {
                statusCode: 409,
                code: ApiErrorCode.AccountDeleting,
            });
        }
    });
}
