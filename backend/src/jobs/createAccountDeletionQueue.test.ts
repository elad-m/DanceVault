import { afterEach, describe, expect, it } from "vitest";
import type { PersistenceProvider } from "../persistence";
import {
    resetRuntimeForTest,
    setRuntimeForTest,
} from "../runtime";
import type { VideoStorageProvider } from "../storage";
import { createAccountDeletionQueue } from "./createAccountDeletionQueue";

const unusedDependencies = {
    persistenceProvider: {} as PersistenceProvider,
    videoStorageProvider: {} as VideoStorageProvider,
};

describe("createAccountDeletionQueue", () => {
    afterEach(() => {
        resetRuntimeForTest();
    });

    it("creates a direct worker queue for the local environment", () => {
        setRuntimeForTest({ environment: "local" });

        const queue = createAccountDeletionQueue(unusedDependencies);

        expect(queue.enqueue).toEqual(expect.any(Function));
        expect(() => queue.close()).not.toThrow();
    });

    it("selects SQS for development without allowing tests to connect", () => {
        setRuntimeForTest({ environment: "dev" });

        expect(() =>
            createAccountDeletionQueue(unusedDependencies)
        ).toThrow("Tests must inject a fake account deletion queue");
    });
});
