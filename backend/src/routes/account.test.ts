import Fastify, { type FastifyInstance } from "fastify";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import type { UserAccountLifecycle } from "../domain/userAccount";
import type {
    AccountDeletionJob,
    AccountDeletionQueue,
} from "../jobs/accountDeletionQueue";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";
import { TEST_USER_ID } from "../test/routeTestSupport";
import { registerAccountRoutes } from "./account";

describe("account routes", () => {
    let app: FastifyInstance;
    let lifecycle: UserAccountLifecycle | null;
    let queuedJobs: AccountDeletionJob[];
    let accountDeletionQueue: AccountDeletionQueue;
    let userAccountDataAccess: UserAccountDataAccess;

    beforeEach(() => {
        lifecycle = null;
        queuedJobs = [];

        userAccountDataAccess = {
            async getUserAccountLifecycle() {
                return lifecycle;
            },

            async startUserAccountDeletion(input) {
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

        accountDeletionQueue = {
            async enqueue(job) {
                queuedJobs.push(job);
            },

            close() { },
        };

        app = Fastify();
        app.addHook("onRequest", async (request) => {
            request.userId = TEST_USER_ID;
            request.identityProviderUserId =
                "cognito-username-1";
        });
        registerAccountRoutes(
            app,
            userAccountDataAccess,
            accountDeletionQueue
        );
    });

    afterEach(async () => {
        await app.close();
    });

    it("queues deletion for the authenticated user", async () => {
        const response = await app.inject({
            method: "DELETE",
            url: "/account",
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            jobID: queuedJobs[0].jobID,
        });
        expect(queuedJobs).toHaveLength(1);
        expect(queuedJobs[0]).toMatchObject({
            schemaVersion: 1,
            userID: TEST_USER_ID,
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: expect.any(String),
        });
        expect(lifecycle).toEqual({
            status: "deleting",
            deletionRequestedAt:
                queuedJobs[0].deletionRequestedAt,
        });
    });

    it("returns an error without reporting acceptance when queueing fails", async () => {
        accountDeletionQueue.enqueue = async () => {
            throw new Error("Queue unavailable");
        };

        const response = await app.inject({
            method: "DELETE",
            url: "/account",
        });

        expect(response.statusCode).toBe(500);
        expect(lifecycle?.status).toBe("deleting");
        expect(queuedJobs).toEqual([]);
    });
});
