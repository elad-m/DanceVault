import type { FastifyInstance } from "fastify";
import { runtime } from "../runtime";
import {
    createCognitoAccessTokenVerifier,
    registerCognitoAuthentication,
    type CognitoAccessTokenVerifier,
} from "./cognitoAuth";
import { registerLocalAuthentication } from "./localAuth";

declare module "fastify" {
    interface FastifyRequest {
        userId: string;
    }
}

export type AuthenticationDependencies =
    | {
        environment: "local";
    }
    | {
        environment: "dev";
        cognitoAccessTokenVerifier: CognitoAccessTokenVerifier;
    };

export function createLiveAuthenticationDependencies():
    AuthenticationDependencies {
    if (runtime.environment === "local") {
        return {
            environment: "local",
        };
    }

    return {
        environment: "dev",
        cognitoAccessTokenVerifier:
            createCognitoAccessTokenVerifier(),
    };
}

export function registerAuthentication(
    app: FastifyInstance,
    authenticationDependencies: AuthenticationDependencies
) {
    app.decorateRequest("userId", "");

    if (authenticationDependencies.environment === "local") {
        registerLocalAuthentication(app);
        return;
    }

    registerCognitoAuthentication(app, {
        accessTokenVerifier:
            authenticationDependencies.cognitoAccessTokenVerifier,
    });
}