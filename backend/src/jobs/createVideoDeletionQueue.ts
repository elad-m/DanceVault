import type { PersistenceProvider } from "../persistence";
import { runtime } from "../runtime";
import type { VideoStorageProvider } from "../storage";
import { createSQSVideoDeletionQueue } from "./sqsVideoDeletionQueue";
import type {
    VideoDeletionJob,
    VideoDeletionQueue,
} from "./videoDeletionQueue";
import { processVideoDeletionJob } from "./videoDeletionWorker";

type CreateVideoDeletionQueueInput = {
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
};

function createLocalVideoDeletionQueue({
    videoStorageProvider,
    persistenceProvider,
}: CreateVideoDeletionQueueInput): VideoDeletionQueue {
    return {
        async enqueue(job: VideoDeletionJob): Promise<void> {
            await processVideoDeletionJob({
                job,
                videoStorageProvider,
                persistenceProvider,
            });
        },

        close(): void { },
    };
}

export function createVideoDeletionQueue({
    videoStorageProvider,
    persistenceProvider,
}: CreateVideoDeletionQueueInput): VideoDeletionQueue {
    if (runtime.environment === "local") {
        return createLocalVideoDeletionQueue({
            videoStorageProvider,
            persistenceProvider,
        });
    }

    return createSQSVideoDeletionQueue();
}