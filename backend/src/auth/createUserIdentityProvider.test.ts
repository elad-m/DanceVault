import { afterEach, describe, expect, it } from "vitest";
import {
    resetRuntimeForTest,
    setRuntimeForTest,
} from "../runtime";
import { createUserIdentityProvider } from "./createUserIdentityProvider";

describe("createUserIdentityProvider", () => {
    afterEach(() => {
        resetRuntimeForTest();
    });

    it("uses a no-op identity provider for local authentication", async () => {
        setRuntimeForTest({ environment: "local" });
        const provider = createUserIdentityProvider();

        await expect(
            provider.deleteUser({
                identityProviderUserID: "local-user",
            })
        ).resolves.toBeUndefined();
        expect(() => provider.close()).not.toThrow();
    });
});
