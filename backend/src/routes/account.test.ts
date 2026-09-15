import Fastify, { type FastifyInstance } from "fastify";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import type { UserAccountLifecycle } from "../domain/userAccount";
import {
    currentLegalPolicyVersions,
    type UserLegalAcceptance,
} from "../domain/legalAcceptance";
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
    let legalAcceptance: UserLegalAcceptance | null;
    let queuedJobs: AccountDeletionJob[];
    let accountDeletionQueue: AccountDeletionQueue;
    let userAccountDataAccess: UserAccountDataAccess;

    beforeEach(() => {
        lifecycle = null;
        legalAcceptance = null;
        queuedJobs = [];

        userAccountDataAccess = {
            async getUserAccountLifecycle() {
                return lifecycle;
            },

            async getUserLegalAcceptance() {
                return legalAcceptance;
            },

            async acceptLegalPolicies(input) {
                legalAcceptance = {
                    ...input.versions,
                    acceptedAt: input.acceptedAt.toISOString(),
                };
                return legalAcceptance;
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

    it("reports and records current legal-policy acceptance", async () => {
        const initialResponse = await app.inject({
            method: "GET",
            url: "/account/legal-acceptance",
        });

        expect(initialResponse.statusCode).toBe(200);
        expect(initialResponse.json()).toEqual({
            required: true,
            currentVersions: currentLegalPolicyVersions,
            acceptance: null,
        });

        const acceptanceResponse = await app.inject({
            method: "POST",
            url: "/account/legal-acceptance",
            payload: currentLegalPolicyVersions,
        });

        expect(acceptanceResponse.statusCode).toBe(200);
        expect(acceptanceResponse.json()).toEqual({
            required: false,
            currentVersions: currentLegalPolicyVersions,
            acceptance: {
                ...currentLegalPolicyVersions,
                acceptedAt: expect.any(String),
            },
        });

        const currentResponse = await app.inject({
            method: "GET",
            url: "/account/legal-acceptance",
        });
        expect(currentResponse.json().required).toBe(false);
    });

    it("rejects acceptance for outdated policy versions", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/account/legal-acceptance",
            payload: {
                privacyNotice: "older",
                termsOfUse: currentLegalPolicyVersions.termsOfUse,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(legalAcceptance).toBeNull();
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
