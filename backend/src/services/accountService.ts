import { randomUUID } from "node:crypto";
import {
    CURRENT_ACCOUNT_DELETION_JOB_SCHEMA_VERSION,
    type AccountDeletionJob,
    type AccountDeletionQueue,
} from "../jobs/accountDeletionQueue";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";

type RequestAccountDeletionInput = {
    userId: string;
    identityProviderUserId: string;
    requestedAt: Date;
    userAccountDataAccess: UserAccountDataAccess;
    accountDeletionQueue: AccountDeletionQueue;
};

export type RequestAccountDeletionResult = {
    kind: "queued";
    job: AccountDeletionJob;
};

export async function requestAccountDeletion({
    userId,
    identityProviderUserId,
    requestedAt,
    userAccountDataAccess,
    accountDeletionQueue,
}: RequestAccountDeletionInput): Promise<RequestAccountDeletionResult> {
    const lifecycle =
        await userAccountDataAccess.startUserAccountDeletion({
            userID: userId,
            requestedAt,
        });

    if (
        lifecycle.status !== "deleting" ||
        lifecycle.deletionRequestedAt === null
    ) {
        throw new Error(
            "Account deletion lifecycle was not persisted"
        );
    }

    const job: AccountDeletionJob = {
        schemaVersion:
            CURRENT_ACCOUNT_DELETION_JOB_SCHEMA_VERSION,
        jobID: randomUUID(),
        userID: userId,
        identityProviderUserID: identityProviderUserId,
        deletionRequestedAt: lifecycle.deletionRequestedAt,
    };

    await accountDeletionQueue.enqueue(job);

    return {
        kind: "queued",
        job,
    };
}
