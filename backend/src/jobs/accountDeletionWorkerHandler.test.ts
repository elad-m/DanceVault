import type { SQSEvent } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountDeletionJob } from "./accountDeletionQueue";
import { createAccountDeletionWorkerHandler } from "./accountDeletionWorkerHandler";

function createSQSEvent(messageBody: string): SQSEvent {
    return {
        Records: [
            {
                messageId: "message-1",
                receiptHandle: "receipt-1",
                body: messageBody,
                attributes: {
                    ApproximateReceiveCount: "1",
                    SentTimestamp: "0",
                    SenderId: "test",
                    ApproximateFirstReceiveTimestamp: "0",
                },
                messageAttributes: {},
                md5OfBody: "test",
                eventSource: "aws:sqs",
                eventSourceARN:
                    "arn:aws:sqs:il-central-1:123456789012:test",
                awsRegion: "il-central-1",
            },
        ],
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("account deletion worker handler", () => {
    const job: AccountDeletionJob = {
        schemaVersion: 1,
        jobID: "job-1",
        userID: "user-1",
        identityProviderUserID: "cognito-username-1",
        deletionRequestedAt: "2026-09-15T12:00:00.000Z",
    };

    it("processes a valid account deletion job", async () => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        const processedJobs: AccountDeletionJob[] = [];
        const handler = createAccountDeletionWorkerHandler({
            async processJob(input): Promise<void> {
                processedJobs.push(input);
            },
        });

        await handler(createSQSEvent(JSON.stringify(job)));

        expect(processedJobs).toEqual([job]);
    });

    it("rejects an invalid queue message", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const handler = createAccountDeletionWorkerHandler({
            async processJob(): Promise<void> {
                throw new Error("Processor should not be called");
            },
        });

        await expect(
            handler(createSQSEvent("invalid-json"))
        ).rejects.toThrow("Invalid account deletion job");
    });

    it("propagates failures so SQS retries the job", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const handler = createAccountDeletionWorkerHandler({
            async processJob(): Promise<void> {
                throw new Error("Cognito unavailable");
            },
        });

        await expect(
            handler(createSQSEvent(JSON.stringify(job)))
        ).rejects.toThrow("Cognito unavailable");
    });
});
