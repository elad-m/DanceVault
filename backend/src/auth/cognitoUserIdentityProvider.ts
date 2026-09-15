import "dotenv/config";
import {
    AdminDeleteUserCommand,
    CognitoIdentityProviderClient,
    UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { isRunningUnderVitest } from "../testEnvironmentSafety";
import type { UserIdentityProvider } from "./userIdentityProvider";

function getEnvironmentVariable(variableName: string): string {
    const value = process.env[variableName];

    if (!value) {
        throw new Error(`${variableName} is not configured`);
    }

    return value;
}

type CreateCognitoUserIdentityProviderInput = {
    client: CognitoIdentityProviderClient;
    userPoolID: string;
    ownsClient?: boolean;
};

export function createCognitoUserIdentityProvider({
    client,
    userPoolID,
    ownsClient = false,
}: CreateCognitoUserIdentityProviderInput): UserIdentityProvider {
    return {
        async deleteUser({ identityProviderUserID }): Promise<void> {
            try {
                await client.send(
                    new AdminDeleteUserCommand({
                        UserPoolId: userPoolID,
                        Username: identityProviderUserID,
                    })
                );
            } catch (error) {
                if (error instanceof UserNotFoundException) {
                    return;
                }

                throw error;
            }
        },

        close(): void {
            if (ownsClient) {
                client.destroy();
            }
        },
    };
}

export function createLiveCognitoUserIdentityProvider():
    UserIdentityProvider {
    if (isRunningUnderVitest()) {
        throw new Error(
            "Tests must inject a fake Cognito user identity provider"
        );
    }

    const client = new CognitoIdentityProviderClient({
        region: getEnvironmentVariable("AWS_COGNITO_REGION"),
    });

    return createCognitoUserIdentityProvider({
        client,
        userPoolID: getEnvironmentVariable("COGNITO_USER_POOL_ID"),
        ownsClient: true,
    });
}
