import Fastify, { type FastifyInstance } from "fastify";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type { CognitoAccessTokenVerifier } from "./cognitoAuth";
import { registerAuthentication } from "./authentication";

let app: FastifyInstance | undefined;

afterEach(async () => {
    await app?.close();
    app = undefined;
});

function buildAuthenticationTestApp(
    accessTokenVerifier: CognitoAccessTokenVerifier
) {
    const testApp = Fastify({
        logger: false,
    });

    registerAuthentication(testApp, {
        environment: "dev",
        cognitoAccessTokenVerifier: accessTokenVerifier,
    });

    testApp.get("/health", async () => ({
        status: "ok",
    }));

    testApp.options("/*", async (_request, reply) => {
        return reply.status(204).send();
    });

    testApp.get("/authenticated-user", async (request) => ({
        userId: request.userId,
        identityProviderUserId:
            request.identityProviderUserId,
    }));

    return testApp;
}

describe("Cognito authentication", () => {
    it("uses the verified Cognito subject as the user ID", async () => {
        const verify = vi.fn(async (accessToken: string) => {
            expect(accessToken).toBe("valid-access-token");

            return {
                sub: "cognito-user-123",
                username: "cognito-internal-username",
            };
        });

        app = buildAuthenticationTestApp({
            verify,
        });

        const response = await app.inject({
            method: "GET",
            url: "/authenticated-user",
            headers: {
                authorization: "Bearer valid-access-token",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            userId: "cognito-user-123",
            identityProviderUserId:
                "cognito-internal-username",
        });
        expect(verify).toHaveBeenCalledOnce();
    });

    it("rejects a request without a bearer token", async () => {
        const verify = vi.fn();

        app = buildAuthenticationTestApp({
            verify,
        });

        const response = await app.inject({
            method: "GET",
            url: "/authenticated-user",
            headers: {
                "x-user-id": "forged-user",
            },
        });

        expect(response.statusCode).toBe(401);
        expect(verify).not.toHaveBeenCalled();
    });

    it("rejects a token that fails verification", async () => {
        const verify = vi.fn(async () => {
            throw new Error("Invalid token");
        });

        app = buildAuthenticationTestApp({
            verify,
        });

        const response = await app.inject({
            method: "GET",
            url: "/authenticated-user",
            headers: {
                authorization: "Bearer invalid-access-token",
            },
        });

        expect(response.statusCode).toBe(401);
    });

    it("leaves the health endpoint public", async () => {
        const verify = vi.fn();

        app = buildAuthenticationTestApp({
            verify,
        });

        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);
        expect(verify).not.toHaveBeenCalled();
    });

    it("leaves browser preflight requests public", async () => {
        const verify = vi.fn();

        app = buildAuthenticationTestApp({
            verify,
        });

        const response = await app.inject({
            method: "OPTIONS",
            url: "/authenticated-user",
        });

        expect(response.statusCode).toBe(204);
        expect(verify).not.toHaveBeenCalled();
    });
});
