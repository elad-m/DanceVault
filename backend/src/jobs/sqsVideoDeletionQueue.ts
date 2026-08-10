import "dotenv/config";
import {
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import type {
    VideoDeletionJob,
    VideoDeletionQueue,
} from "./videoDeletionQueue";

function requireEnvironmentVariable(
    variableName: string
): string {
    const value = process.env[variableName];

    if (!value) {
        throw new Error(
            `${variableName} is not configured`
        );
    }

    return value;
}

export function createSQSVideoDeletionQueue():
    VideoDeletionQueue {
    const queueURL = requireEnvironmentVariable(
        "VIDEO_DELETION_QUEUE_URL"
    );
    const client = new SQSClient({
        region: requireEnvironmentVariable(
            "AWS_SQS_REGION"
        ),
    });

    return {
        async enqueue(job: VideoDeletionJob): Promise<void> {
            await client.send(
                new SendMessageCommand({
                    QueueUrl: queueURL,
                    MessageBody: JSON.stringify(job),
                })
            );
        },

        close(): void {
            client.destroy();
        },
    };
}
