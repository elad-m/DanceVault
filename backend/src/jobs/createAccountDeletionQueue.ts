import { createUserIdentityProvider } from "../auth/createUserIdentityProvider";
import type { PersistenceProvider } from "../persistence";
import { runtime } from "../runtime";
import type { VideoStorageProvider } from "../storage";
import type {
    AccountDeletionJob,
    AccountDeletionQueue,
} from "./accountDeletionQueue";
import { processAccountDeletionJob } from "./accountDeletionWorker";
import { createSQSAccountDeletionQueue } from "./sqsAccountDeletionQueue";

type CreateAccountDeletionQueueInput = {
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
};

function createLocalAccountDeletionQueue({
    videoStorageProvider,
    persistenceProvider,
}: CreateAccountDeletionQueueInput): AccountDeletionQueue {
    const userIdentityProvider = createUserIdentityProvider();

    return {
        async enqueue(job: AccountDeletionJob): Promise<void> {
            await processAccountDeletionJob({
                job,
                videoStorageProvider,
                persistenceProvider,
                userIdentityProvider,
            });
        },

        close(): void {
            userIdentityProvider.close();
        },
    };
}

export function createAccountDeletionQueue({
    videoStorageProvider,
    persistenceProvider,
}: CreateAccountDeletionQueueInput): AccountDeletionQueue {
    if (runtime.environment === "local") {
        return createLocalAccountDeletionQueue({
            videoStorageProvider,
            persistenceProvider,
        });
    }

    return createSQSAccountDeletionQueue();
}
