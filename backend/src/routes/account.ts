import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import type { AccountDeletionQueue } from "../jobs/accountDeletionQueue";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";
import { requestAccountDeletion } from "../services/accountService";
import {
    currentLegalPolicyVersions,
    isCurrentLegalAcceptance,
    type LegalPolicyVersions,
} from "../domain/legalAcceptance";

type LegalAcceptanceRequest = FastifyRequest<{
    Body: LegalPolicyVersions;
}>;

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
    app.get("/account/legal-acceptance", async (request) => {
        const acceptance =
            await userAccountDataAccess.getUserLegalAcceptance({
                userID: request.userId,
            });

        return {
            required: !isCurrentLegalAcceptance(acceptance),
            currentVersions: currentLegalPolicyVersions,
            acceptance,
        };
    });

    app.post(
        "/account/legal-acceptance",
        {
            schema: {
                body: {
                    type: "object",
                    additionalProperties: false,
                    required: ["privacyNotice", "termsOfUse"],
                    properties: {
                        privacyNotice: {
                            type: "string",
                            const: currentLegalPolicyVersions.privacyNotice,
                        },
                        termsOfUse: {
                            type: "string",
                            const: currentLegalPolicyVersions.termsOfUse,
                        },
                    },
                },
            },
        },
        async (request: LegalAcceptanceRequest, reply) => {
            const acceptance =
                await userAccountDataAccess.acceptLegalPolicies({
                    userID: request.userId,
                    versions: request.body,
                    acceptedAt: new Date(),
                });

            request.log.info(
                {
                    event: "legal_policies_accepted",
                    userId: request.userId,
                    ...request.body,
                    acceptedAt: acceptance.acceptedAt,
                },
                "Current legal policies accepted"
            );

            return reply.status(200).send({
                required: false,
                currentVersions: currentLegalPolicyVersions,
                acceptance,
            });
        }
    );

    app.delete("/account", (request, reply) =>
        deleteAccountHandler(
            request,
            reply,
            userAccountDataAccess,
            accountDeletionQueue
        )
    );
}
