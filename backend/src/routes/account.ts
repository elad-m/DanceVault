import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import type { AccountDeletionQueue } from "../jobs/accountDeletionQueue";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";
import { requestAccountDeletion } from "../services/accountService";

async function deleteAccountHandler(
    request: FastifyRequest,
    reply: FastifyReply,
    userAccountDataAccess: UserAccountDataAccess,
    accountDeletionQueue: AccountDeletionQueue
) {
    let result;

    try {
        result = await requestAccountDeletion({
            userId: request.userId,
            identityProviderUserId:
                request.identityProviderUserId,
            requestedAt: new Date(),
            userAccountDataAccess,
            accountDeletionQueue,
        });
    } catch (error) {
        request.log.error(
            {
                event: "account_deletion_queueing_failed",
                userId: request.userId,
                err: error,
            },
            "Account deletion could not be queued"
        );
        throw error;
    }

    request.log.info(
        {
            event: "account_deletion_queued",
            userId: request.userId,
            jobId: result.job.jobID,
            deletionRequestedAt:
                result.job.deletionRequestedAt,
        },
        "Account deletion queued"
    );

    return reply.status(202).send({
        jobID: result.job.jobID,
    });
}

export function registerAccountRoutes(
    app: FastifyInstance,
    userAccountDataAccess: UserAccountDataAccess,
    accountDeletionQueue: AccountDeletionQueue
) {
    app.delete("/account", (request, reply) =>
        deleteAccountHandler(
            request,
            reply,
            userAccountDataAccess,
            accountDeletionQueue
        )
    );
}
