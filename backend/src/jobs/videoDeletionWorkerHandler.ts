import type { SQSEvent } from "aws-lambda";
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
    parseVideoDeletionJob,
    type VideoDeletionJob,
} from "./videoDeletionQueue";
import { processVideoDeletionJob } from "./videoDeletionWorker";

export type VideoDeletionWorkerDependencies = {
    processJob(job: VideoDeletionJob): Promise<void>;
};

type VideoDeletionWorkerHandler = (
    event: SQSEvent
) => Promise<void>;

export function createVideoDeletionWorkerHandler(
    dependencies: VideoDeletionWorkerDependencies
): VideoDeletionWorkerHandler {
    return async (event): Promise<void> => {
        for (const record of event.Records) {
            try {
                const job = parseVideoDeletionJob(
                    record.body
                );

                await dependencies.processJob(job);

                console.info(
                    JSON.stringify({
                        event: "video_deletion_completed",
                        messageID: record.messageId,
                        jobID: job.jobID,
                        userID: job.userID,
                        videoID: job.videoID,
                    })
                );
            } catch (error: unknown) {
                console.error(
                    JSON.stringify({
                        event: "video_deletion_failed",
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
    dependencies: VideoDeletionWorkerDependencies;
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
};

function createLiveWorkerResources(): LiveWorkerResources {
    const videoStorageProvider =
        createVideoStorageProvider(
            getActiveVideoStorageProviderName()
        );
    const persistenceProvider =
        createPersistenceProvider();

    return {
        videoStorageProvider,
        persistenceProvider,

        dependencies: {
            async processJob(
                job: VideoDeletionJob
            ): Promise<void> {
                await processVideoDeletionJob({
                    job,
                    videoStorageProvider,
                    persistenceProvider,
                });
            },
        },
    };
}

let liveWorkerResources: LiveWorkerResources | undefined;

export const handler: VideoDeletionWorkerHandler = async (event) => {
    liveWorkerResources ??= createLiveWorkerResources();

    const liveHandler =
        createVideoDeletionWorkerHandler(
            liveWorkerResources.dependencies
        );

    return liveHandler(event);
};
