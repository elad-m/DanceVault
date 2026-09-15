import { describe, expect, it } from "vitest";
import {
    parseAccountDeletionJob,
    type AccountDeletionJob,
} from "./accountDeletionQueue";

describe("parseAccountDeletionJob", () => {
    it("decodes a valid account deletion job", () => {
        const expectedJob: AccountDeletionJob = {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        };

        expect(
            parseAccountDeletionJob(
                JSON.stringify(expectedJob)
            )
        ).toEqual(expectedJob);
    });

    it.each([
        {
            schemaVersion: 2,
            jobID: "job-1",
            userID: "user-1",
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        },
        {
            schemaVersion: 1,
            jobID: "",
            userID: "user-1",
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        },
        {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "",
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        },
        {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            identityProviderUserID: "",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        },
        {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: "not-a-timestamp",
        },
        {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            identityProviderUserID: "cognito-username-1",
            deletionRequestedAt: "2026-09-10",
        },
    ])("rejects an invalid job: %#", (job) => {
        expect(() =>
            parseAccountDeletionJob(JSON.stringify(job))
        ).toThrow("Invalid account deletion job");
    });

    it("rejects malformed JSON", () => {
        expect(() =>
            parseAccountDeletionJob("not-json")
        ).toThrow("Invalid account deletion job");
    });
});
