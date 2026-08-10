import type { SQSEvent } from "aws-lambda";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type { VideoDeletionJob } from "./videoDeletionQueue";
import { createVideoDeletionWorkerHandler } from "./videoDeletionWorkerHandler";

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

describe("video deletion worker handler", () => {
    it("processes a valid video deletion job", async () => {
        vi.spyOn(console, "info").mockImplementation(
            () => {}
        );

        const processedJobs: VideoDeletionJob[] = [];
        const handler = createVideoDeletionWorkerHandler({
            async processJob(job): Promise<void> {
                processedJobs.push(job);
            },
        });

        const job: VideoDeletionJob = {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            videoID: "video-1",
        };

        await handler(createSQSEvent(JSON.stringify(job)));

        expect(processedJobs).toEqual([job]);
    });

    it("rejects an invalid queue message", async () => {
        vi.spyOn(console, "error").mockImplementation(
            () => {}
        );

        const handler = createVideoDeletionWorkerHandler({
            async processJob(): Promise<void> {
                throw new Error(
                    "Processor should not be called"
                );
            },
        });

        await expect(
            handler(createSQSEvent("invalid-json"))
        ).rejects.toThrow(
            "Invalid video deletion job"
        );
    });

    it("propagates processing failures so SQS retries the job", async () => {
        vi.spyOn(console, "error").mockImplementation(
            () => {}
        );

        const handler = createVideoDeletionWorkerHandler({
            async processJob(): Promise<void> {
                throw new Error("DynamoDB unavailable");
            },
        });

        const job: VideoDeletionJob = {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            videoID: "video-1",
        };

        await expect(
            handler(createSQSEvent(JSON.stringify(job)))
        ).rejects.toThrow("DynamoDB unavailable");
    });
});
