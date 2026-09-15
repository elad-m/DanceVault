import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
    currentLegalPolicyVersions,
    type UserLegalAcceptance,
} from "../domain/legalAcceptance";
import type { UserAccountDataAccess } from "../persistence/userAccountDataAccess";
import { registerLegalAcceptanceGuard } from "./legalAcceptanceGuard";

const userID = "test-user-1";

async function createTestApp(
    acceptance: UserLegalAcceptance | null,
    environment: "local" | "dev" = "dev"
) {
    let acceptanceReads = 0;
    const userAccountDataAccess: UserAccountDataAccess = {
        async getUserAccountLifecycle() {
            return null;
        },
        async getUserLegalAcceptance() {
            acceptanceReads += 1;
            return acceptance;
        },
        async acceptLegalPolicies() {
            throw new Error("Not used by legal guard tests");
        },
        async startUserAccountDeletion() {
            throw new Error("Not used by legal guard tests");
        },
    };
    const app = Fastify();
    app.decorateRequest("userId", "");
    app.addHook("preHandler", async (request) => {
        request.userId = userID;
    });
    registerLegalAcceptanceGuard(
        app,
        userAccountDataAccess,
        environment
    );
    app.get("/videos", async () => ({ videos: [] }));
    app.get("/account/legal-acceptance", async () => ({ required: true }));
    app.post("/account/legal-acceptance", async () => ({ required: false }));
    app.delete("/account", async (_request, reply) =>
        reply.status(202).send()
    );

    await app.ready();
    return { app, getAcceptanceReads: () => acceptanceReads };
}

describe("legal acceptance guard", () => {
    it("blocks hosted application access without current acceptance", async () => {
        const { app } = await createTestApp(null);

        try {
            const response = await app.inject({ method: "GET", url: "/videos" });
            expect(response.statusCode).toBe(428);
            expect(response.json()).toEqual({
                error: {
                    code: "LEGAL_ACCEPTANCE_REQUIRED",
                    message: "Current Terms of Use and Privacy Notice must be accepted",
                },
            });
        } finally {
            await app.close();
        }
    });

    it("allows hosted access after accepting current versions", async () => {
        const { app, getAcceptanceReads } = await createTestApp({
            ...currentLegalPolicyVersions,
            acceptedAt: "2026-09-15T12:00:00.000Z",
        });

        try {
            const response = await app.inject({ method: "GET", url: "/videos" });
            expect(response.statusCode).toBe(200);
            expect((await app.inject({ method: "GET", url: "/videos" })).statusCode).toBe(200);
            expect(getAcceptanceReads()).toBe(1);
        } finally {
            await app.close();
        }
    });

    it("leaves acceptance and deletion routes available", async () => {
        const { app, getAcceptanceReads } = await createTestApp(null);

        try {
            expect((await app.inject({ method: "GET", url: "/account/legal-acceptance" })).statusCode).toBe(200);
            expect((await app.inject({ method: "POST", url: "/account/legal-acceptance" })).statusCode).toBe(200);
            expect((await app.inject({ method: "DELETE", url: "/account" })).statusCode).toBe(202);
            expect(getAcceptanceReads()).toBe(0);
        } finally {
            await app.close();
        }
    });

    it("does not enforce hosted policy acceptance in local development", async () => {
        const { app, getAcceptanceReads } = await createTestApp(null, "local");

        try {
            expect((await app.inject({ method: "GET", url: "/videos" })).statusCode).toBe(200);
            expect(getAcceptanceReads()).toBe(0);
        } finally {
            await app.close();
        }
    });
});
