import type { PersistenceProvider } from "../persistence";
import { runtime } from "../runtime";
import type { VideoStorageProvider } from "../storage";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";
import { createSQSVideoDeletionQueue } from "./sqsVideoDeletionQueue";
import type {
    VideoDeletionJob,
    VideoDeletionQueue,
} from "./videoDeletionQueue";
import { processVideoDeletionJob } from "./videoDeletionWorker";

type CreateVideoDeletionQueueInput = {
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
    segmentExportStorageProvider: SegmentExportStorageProvider;
};

function createLocalVideoDeletionQueue({
    videoStorageProvider,
    persistenceProvider,
    segmentExportStorageProvider,
}: CreateVideoDeletionQueueInput): VideoDeletionQueue {
    return {
        async enqueue(job: VideoDeletionJob): Promise<void> {
            await processVideoDeletionJob({
                job,
                videoStorageProvider,
                persistenceProvider,
                segmentExportStorageProvider,
            });
        },

        close(): void { },
    };
}

export function createVideoDeletionQueue({
    videoStorageProvider,
    persistenceProvider,
    segmentExportStorageProvider,
}: CreateVideoDeletionQueueInput): VideoDeletionQueue {
    if (runtime.environment === "local") {
        return createLocalVideoDeletionQueue({
            videoStorageProvider,
            persistenceProvider,
            segmentExportStorageProvider,
        });
    }

    return createSQSVideoDeletionQueue();
}
