import { runtime } from "../runtime";
import { createLiveCognitoUserIdentityProvider } from "./cognitoUserIdentityProvider";
import type { UserIdentityProvider } from "./userIdentityProvider";

function createLocalUserIdentityProvider(): UserIdentityProvider {
    return {
        async deleteUser(): Promise<void> {
            // Local authentication has no external identity store.
        },

        close(): void { },
    };
}

export function createUserIdentityProvider(): UserIdentityProvider {
    if (runtime.environment === "local") {
        return createLocalUserIdentityProvider();
    }

    return createLiveCognitoUserIdentityProvider();
}
