import type { SQSRecord } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import {
    createSegmentExportWorkerHandler,
    segmentExportMaximumReceiveCount,
} from "./segmentExportWorkerHandler";

const job = {
    schemaVersion: 1,
    exportID: "export-1",
    userID: "user-1",
    segmentID: "segment-1",
    sourceStorageKey: "users/user-1/videos/video-1.mov",
    outputStorageKey:
        "users/user-1/exports/segments/segment-1/export-1.mp4",
    startMilliseconds: 1_000,
    endMilliseconds: 5_000,
};

function createRecord(receiveCount: number): SQSRecord {
    return {
        messageId: "message-1",
        receiptHandle: "receipt",
        body: JSON.stringify(job),
        attributes: {
            ApproximateReceiveCount: receiveCount.toString(),
            SentTimestamp: "0",
            SenderId: "sender",
            ApproximateFirstReceiveTimestamp: "0",
        },
        messageAttributes: {},
        md5OfBody: "md5",
        eventSource: "aws:sqs",
        eventSourceARN: "queue-arn",
        awsRegion: "il-central-1",
    };
}

describe("segment export worker handler", () => {
    it("processes a valid SQS job", async () => {
        const processJob = vi.fn(async () => undefined);
        const markJobFailed = vi.fn(async () => undefined);
        const handler = createSegmentExportWorkerHandler({
            processJob,
            markJobFailed,
        });

        await handler({ Records: [createRecord(1)] });

        expect(processJob).toHaveBeenCalledWith(job);
        expect(markJobFailed).not.toHaveBeenCalled();
    });

    it("rethrows retryable failures without releasing the export lock", async () => {
        const error = new Error("temporary S3 failure");
        const markJobFailed = vi.fn(async () => undefined);
        const handler = createSegmentExportWorkerHandler({
            processJob: vi.fn(async () => { throw error; }),
            markJobFailed,
        });

        await expect(
            handler({ Records: [createRecord(2)] })
        ).rejects.toBe(error);
        expect(markJobFailed).not.toHaveBeenCalled();
    });

    it("marks the export failed before the final attempt enters the DLQ", async () => {
        const error = new Error("permanent FFmpeg failure");
        const markJobFailed = vi.fn(async () => undefined);
        const handler = createSegmentExportWorkerHandler({
            processJob: vi.fn(async () => { throw error; }),
            markJobFailed,
        });

        await expect(
            handler({
                Records: [
                    createRecord(segmentExportMaximumReceiveCount),
                ],
            })
        ).rejects.toBe(error);
        expect(markJobFailed).toHaveBeenCalledWith(job, error);
    });
});
