import "dotenv/config";
import {
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import { isRunningUnderVitest } from "../testEnvironmentSafety";
import type {
    AccountDeletionJob,
    AccountDeletionQueue,
} from "./accountDeletionQueue";

function getEnvironmentVariable(variableName: string): string {
    const value = process.env[variableName];

    if (!value) {
        throw new Error(`${variableName} is not configured`);
    }

    return value;
}

export function createSQSAccountDeletionQueue():
    AccountDeletionQueue {
    if (isRunningUnderVitest()) {
        throw new Error(
            "Tests must inject a fake account deletion queue"
        );
    }

    const queueURL = getEnvironmentVariable(
        "ACCOUNT_DELETION_QUEUE_URL"
    );
    const client = new SQSClient({
        region: getEnvironmentVariable("AWS_SQS_REGION"),
    });

    return {
        async enqueue(job: AccountDeletionJob): Promise<void> {
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
