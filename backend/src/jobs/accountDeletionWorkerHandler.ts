import type { SQSEvent } from "aws-lambda";
import { createUserIdentityProvider } from "../auth/createUserIdentityProvider";
import type { UserIdentityProvider } from "../auth/userIdentityProvider";
import {
    createPersistenceProvider,
    type PersistenceProvider,
} from "../persistence";
import {
    createVideoStorageProvider,
    getActiveVideoStorageProviderName,
    type VideoStorageProvider,
} from "../storage";
import {
    parseAccountDeletionJob,
    type AccountDeletionJob,
} from "./accountDeletionQueue";
import { processAccountDeletionJob } from "./accountDeletionWorker";

export type AccountDeletionWorkerDependencies = {
    processJob(job: AccountDeletionJob): Promise<void>;
};

type AccountDeletionWorkerHandler = (
    event: SQSEvent
) => Promise<void>;

export function createAccountDeletionWorkerHandler(
    dependencies: AccountDeletionWorkerDependencies
): AccountDeletionWorkerHandler {
    return async (event): Promise<void> => {
        for (const record of event.Records) {
            try {
                const job = parseAccountDeletionJob(record.body);

                await dependencies.processJob(job);

                console.info(
                    JSON.stringify({
                        event: "account_deletion_completed",
                        messageID: record.messageId,
                        jobID: job.jobID,
                        userID: job.userID,
                    })
                );
            } catch (error: unknown) {
                console.error(
                    JSON.stringify({
                        event: "account_deletion_failed",
                        messageID: record.messageId,
                        error:
                            error instanceof Error
                                ? error.message
                                : "Unknown error",
                    })
                );

                throw error;
            }
        }
    };
}

type LiveWorkerResources = {
    dependencies: AccountDeletionWorkerDependencies;
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
    userIdentityProvider: UserIdentityProvider;
};

function createLiveWorkerResources(): LiveWorkerResources {
    const videoStorageProvider = createVideoStorageProvider(
        getActiveVideoStorageProviderName()
    );
    const persistenceProvider = createPersistenceProvider();
    const userIdentityProvider = createUserIdentityProvider();

    return {
        videoStorageProvider,
        persistenceProvider,
        userIdentityProvider,

        dependencies: {
            async processJob(job: AccountDeletionJob): Promise<void> {
                await processAccountDeletionJob({
                    job,
                    videoStorageProvider,
                    persistenceProvider,
                    userIdentityProvider,
                });
            },
        },
    };
}

let liveWorkerResources: LiveWorkerResources | undefined;

export const handler: AccountDeletionWorkerHandler = async (event) => {
    liveWorkerResources ??= createLiveWorkerResources();

    const liveHandler = createAccountDeletionWorkerHandler(
        liveWorkerResources.dependencies
    );

    return liveHandler(event);
};
