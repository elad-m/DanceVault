import {
    AdminDeleteUserCommand,
    CognitoIdentityProviderClient,
    UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it, vi } from "vitest";
import { createCognitoUserIdentityProvider } from "./cognitoUserIdentityProvider";

function createClient() {
    const send = vi.fn();
    const destroy = vi.fn();
    const client = {
        send,
        destroy,
    } as unknown as CognitoIdentityProviderClient;

    return { client, send, destroy };
}

describe("Cognito user identity provider", () => {
    it("deletes the exact Cognito username from the verified token", async () => {
        const { client, send } = createClient();
        send.mockResolvedValueOnce({});
        const provider = createCognitoUserIdentityProvider({
            client,
            userPoolID: "test-pool",
        });

        await provider.deleteUser({
            identityProviderUserID: "cognito-internal-username",
        });

        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0]).toBeInstanceOf(
            AdminDeleteUserCommand
        );
        expect(send.mock.calls[0][0].input).toEqual({
            UserPoolId: "test-pool",
            Username: "cognito-internal-username",
        });
    });

    it("succeeds when the identity is already absent", async () => {
        const { client, send } = createClient();
        send.mockRejectedValueOnce(
            new UserNotFoundException({
                message: "User no longer exists",
                $metadata: {},
            })
        );
        const provider = createCognitoUserIdentityProvider({
            client,
            userPoolID: "test-pool",
        });

        await expect(
            provider.deleteUser({
                identityProviderUserID: "missing-user",
            })
        ).resolves.toBeUndefined();
    });

    it("propagates unexpected Cognito deletion failures", async () => {
        const { client, send } = createClient();
        send.mockRejectedValueOnce(new Error("Cognito unavailable"));
        const provider = createCognitoUserIdentityProvider({
            client,
            userPoolID: "test-pool",
        });

        await expect(
            provider.deleteUser({
                identityProviderUserID: "username",
            })
        ).rejects.toThrow("Cognito unavailable");
    });

    it("closes a client owned by the live provider", () => {
        const { client, destroy } = createClient();
        const provider = createCognitoUserIdentityProvider({
            client,
            userPoolID: "test-pool",
            ownsClient: true,
        });

        provider.close();

        expect(destroy).toHaveBeenCalledOnce();
    });
});
