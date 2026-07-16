import "dotenv/config";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { FastifyInstance } from "fastify";
import { ApiErrorCode, sendApiError } from "../httpErrors";

export type CognitoAccessTokenVerifier = {
    verify(accessToken: string): Promise<{sub: string}>;
};

export function createCognitoAccessTokenVerifier(): CognitoAccessTokenVerifier {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;

    if (!userPoolId) {
        throw new Error("COGNITO_USER_POOL_ID is not configured");
    }

    if (!clientId) {
        throw new Error("COGNITO_CLIENT_ID is not configured");
    }

    return CognitoJwtVerifier.create({
        userPoolId,
        clientId,
        tokenUse: "access",
    });
}

function extractBearerAccessToken(
    authorizationHeader: string | undefined
): string | null {
    const match = authorizationHeader?.match(/^Bearer\s+(\S+)$/i);

    return match?.[1] ?? null;
}

type RegisterCognitoAuthenticationOptions = {
    accessTokenVerifier: CognitoAccessTokenVerifier;
};

export function registerCognitoAuthentication(
    app: FastifyInstance,
    {
        accessTokenVerifier,
    }: RegisterCognitoAuthenticationOptions
) {
    app.addHook("preHandler", async (request, reply) => {
        if (request.url === "/health") {
            return;
        }

        const accessToken = extractBearerAccessToken(
            request.headers.authorization
        );

        if (!accessToken) {
            return sendApiError(reply, {
                statusCode: 401,
                code: ApiErrorCode.Unauthorized,
            });
        }

        try {
            const payload = await accessTokenVerifier.verify(accessToken);
            request.userId = payload.sub;
        } catch {
            return sendApiError(reply, {
                statusCode: 401,
                code: ApiErrorCode.Unauthorized,
            });
        }
    });
}