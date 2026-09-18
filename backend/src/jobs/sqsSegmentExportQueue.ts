import "dotenv/config";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { isRunningUnderVitest } from "../testEnvironmentSafety";
import type {
    SegmentExportJob,
    SegmentExportQueue,
} from "./segmentExportQueue";

function getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not configured`);
    return value;
}

export function createSQSSegmentExportQueue(): SegmentExportQueue {
    if (isRunningUnderVitest()) {
        throw new Error("Tests must inject a fake segment export queue");
    }

    const queueURL = getRequiredEnvironmentVariable(
        "SEGMENT_EXPORT_QUEUE_URL"
    );
    const client = new SQSClient({
        region: getRequiredEnvironmentVariable("AWS_SQS_REGION"),
    });

    return {
        async enqueue(job: SegmentExportJob) {
            await client.send(
                new SendMessageCommand({
                    QueueUrl: queueURL,
                    MessageBody: JSON.stringify(job),
                })
            );
        },
        close() {
            client.destroy();
        },
    };
}
