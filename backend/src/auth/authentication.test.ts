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

    testApp.get("/authenticated-user", async (request) => ({
        userId: request.userId,
    }));

    return testApp;
}

describe("Cognito authentication", () => {
    it("uses the verified Cognito subject as the user ID", async () => {
        const verify = vi.fn(async (accessToken: string) => {
            expect(accessToken).toBe("valid-access-token");

            return {
                sub: "cognito-user-123",
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
});