import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { UserAccountLifecycle } from "../domain/userAccount";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";
import { registerAccountWriteGuard } from "./accountWriteGuard";

const userID = "test-user-1";

async function createTestApp(
    lifecycle: UserAccountLifecycle | null
) {
    const lifecycleReads: string[] = [];
    const userAccountDataAccess: UserAccountDataAccess = {
        async getUserAccountLifecycle({ userID: requestedUserID }) {
            lifecycleReads.push(requestedUserID);
            return lifecycle;
        },
        async getUserLegalAcceptance() {
            return null;
        },
        async acceptLegalPolicies() {
            throw new Error("Not used by write guard tests");
        },
        async startUserAccountDeletion() {
            throw new Error("Not used by write guard tests");
        },
    };
    const app = Fastify();
    app.decorateRequest("userId", "");
    app.addHook("preHandler", async (request) => {
        request.userId = userID;
    });
    registerAccountWriteGuard(app, userAccountDataAccess);
    app.post("/resource", async (_request, reply) =>
        reply.status(201).send({ created: true })
    );
    app.get("/resource", async () => ({ found: true }));
    app.delete("/account", async (_request, reply) =>
        reply.status(202).send({ queued: true })
    );

    await app.ready();

    return { app, lifecycleReads };
}

describe("account write guard", () => {
    it("allows writes for accounts without a lifecycle record", async () => {
        const { app, lifecycleReads } = await createTestApp(null);

        const response = await app.inject({
            method: "POST",
            url: "/resource",
        });

        expect(response.statusCode).toBe(201);
        expect(lifecycleReads).toEqual([userID]);
        await app.close();
    });

    it("blocks writes after account deletion starts", async () => {
        const { app } = await createTestApp({
            status: "deleting",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        });

        const response = await app.inject({
            method: "POST",
            url: "/resource",
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            error: {
                code: "ACCOUNT_DELETING",
                message: "Account is being deleted",
            },
        });
        await app.close();
    });

    it("blocks writes from an unexpired token after deletion completes", async () => {
        const { app } = await createTestApp({
            status: "deleted",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        });

        const response = await app.inject({
            method: "POST",
            url: "/resource",
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            error: {
                code: "ACCOUNT_DELETING",
                message: "Account is being deleted",
            },
        });
        await app.close();
    });

    it("allows reads while deletion is pending", async () => {
        const { app, lifecycleReads } = await createTestApp({
            status: "deleting",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        });

        const response = await app.inject({
            method: "GET",
            url: "/resource",
        });

        expect(response.statusCode).toBe(200);
        expect(lifecycleReads).toEqual([]);
        await app.close();
    });

    it("allows repeated account-deletion requests for recovery", async () => {
        const { app, lifecycleReads } = await createTestApp({
            status: "deleting",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        });

        const response = await app.inject({
            method: "DELETE",
            url: "/account",
        });

        expect(response.statusCode).toBe(202);
        expect(lifecycleReads).toEqual([]);
        await app.close();
    });
});
