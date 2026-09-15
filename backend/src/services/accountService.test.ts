import { describe, expect, it } from "vitest";
import type { UserAccountLifecycle } from "../domain/userAccount";
import type {
    AccountDeletionJob,
    AccountDeletionQueue,
} from "../jobs/accountDeletionQueue";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";
import { requestAccountDeletion } from "./accountService";

const userID = "test-user-1";
const identityProviderUserID = "cognito-username-1";
const firstRequestedAt = new Date("2026-09-10T12:00:00.000Z");

function createAccountDeletionTestContext() {
    let lifecycle: UserAccountLifecycle | null = null;
    const events: string[] = [];
    const queuedJobs: AccountDeletionJob[] = [];
    let queueError: Error | null = null;

    const userAccountDataAccess: UserAccountDataAccess = {
        async getUserAccountLifecycle() {
            return lifecycle;
        },

        async startUserAccountDeletion(input) {
            events.push("lifecycle-persisted");

            if (lifecycle?.status !== "deleting") {
                lifecycle = {
                    status: "deleting",
                    deletionRequestedAt:
                        input.requestedAt.toISOString(),
                };
            }

            return lifecycle;
        },
    };

    const accountDeletionQueue: AccountDeletionQueue = {
        async enqueue(job) {
            events.push("job-enqueued");

            if (queueError) {
                throw queueError;
            }

            queuedJobs.push(job);
        },

        close() { },
    };

    return {
        userAccountDataAccess,
        accountDeletionQueue,
        events,
        queuedJobs,
        getLifecycle: () => lifecycle,
        setQueueError: (error: Error | null) => {
            queueError = error;
        },
    };
}

describe("requestAccountDeletion", () => {
    it("persists the deleting marker before enqueueing the job", async () => {
        const context = createAccountDeletionTestContext();

        const result = await requestAccountDeletion({
            userId: userID,
            identityProviderUserId: identityProviderUserID,
            requestedAt: firstRequestedAt,
            userAccountDataAccess:
                context.userAccountDataAccess,
            accountDeletionQueue:
                context.accountDeletionQueue,
        });

        expect(context.events).toEqual([
            "lifecycle-persisted",
            "job-enqueued",
        ]);
        expect(result.job).toMatchObject({
            schemaVersion: 1,
            jobID: expect.any(String),
            userID,
            deletionRequestedAt:
                firstRequestedAt.toISOString(),
        });
        expect(context.queuedJobs).toEqual([result.job]);
    });

    it("reuses the original timestamp when a request is repeated", async () => {
        const context = createAccountDeletionTestContext();

        const firstResult = await requestAccountDeletion({
            userId: userID,
            identityProviderUserId: identityProviderUserID,
            requestedAt: firstRequestedAt,
            userAccountDataAccess:
                context.userAccountDataAccess,
            accountDeletionQueue:
                context.accountDeletionQueue,
        });
        const repeatedResult = await requestAccountDeletion({
            userId: userID,
            identityProviderUserId: identityProviderUserID,
            requestedAt: new Date("2026-09-11T12:00:00.000Z"),
            userAccountDataAccess:
                context.userAccountDataAccess,
            accountDeletionQueue:
                context.accountDeletionQueue,
        });

        expect(repeatedResult.job.deletionRequestedAt).toBe(
            firstResult.job.deletionRequestedAt
        );
        expect(context.queuedJobs).toHaveLength(2);
        expect(context.queuedJobs[0].jobID).not.toBe(
            context.queuedJobs[1].jobID
        );
    });

    it("keeps the deleting marker when queueing fails so retry can recover", async () => {
        const context = createAccountDeletionTestContext();
        context.setQueueError(new Error("Queue unavailable"));

        await expect(
            requestAccountDeletion({
                userId: userID,
                identityProviderUserId: identityProviderUserID,
                requestedAt: firstRequestedAt,
                userAccountDataAccess:
                    context.userAccountDataAccess,
                accountDeletionQueue:
                    context.accountDeletionQueue,
            })
        ).rejects.toThrow("Queue unavailable");

        expect(context.getLifecycle()).toEqual({
            status: "deleting",
            deletionRequestedAt:
                firstRequestedAt.toISOString(),
        });

        context.setQueueError(null);

        const retryResult = await requestAccountDeletion({
            userId: userID,
            identityProviderUserId: identityProviderUserID,
            requestedAt: new Date("2026-09-11T12:00:00.000Z"),
            userAccountDataAccess:
                context.userAccountDataAccess,
            accountDeletionQueue:
                context.accountDeletionQueue,
        });

        expect(retryResult.job.deletionRequestedAt).toBe(
            firstRequestedAt.toISOString()
        );
        expect(context.queuedJobs).toEqual([retryResult.job]);
    });

    it("rejects an invalid lifecycle result without enqueueing", async () => {
        const context = createAccountDeletionTestContext();
        const invalidDataAccess: UserAccountDataAccess = {
            ...context.userAccountDataAccess,
            async startUserAccountDeletion() {
                return {
                    status: "active",
                    deletionRequestedAt: null,
                };
            },
        };

        await expect(
            requestAccountDeletion({
                userId: userID,
                identityProviderUserId: identityProviderUserID,
                requestedAt: firstRequestedAt,
                userAccountDataAccess: invalidDataAccess,
                accountDeletionQueue:
                    context.accountDeletionQueue,
            })
        ).rejects.toThrow(
            "Account deletion lifecycle was not persisted"
        );
        expect(context.queuedJobs).toEqual([]);
    });
});
