import type { SQSEvent } from "aws-lambda";
import { createStaticFFmpegSegmentExportProcessor } from "../media/staticFFmpegSegmentExportProcessor";
import { createPersistenceProvider } from "../persistence";
import {
    createSegmentExportStorageProvider,
    type SegmentExportStorageProvider,
} from "../storage/segmentExportStorageProvider";
import { getActiveVideoStorageProviderName } from "../storage";
import {
    parseSegmentExportJob,
    type SegmentExportJob,
} from "./segmentExportQueue";
import { processSegmentExportJob } from "./segmentExportWorker";

export const segmentExportMaximumReceiveCount = 5;

type SegmentExportWorkerDependencies = {
    processJob(job: SegmentExportJob): Promise<void>;
    markJobFailed(job: SegmentExportJob, error: unknown): Promise<void>;
};

export function createSegmentExportWorkerHandler(
    dependencies: SegmentExportWorkerDependencies
) {
    return async (event: SQSEvent): Promise<void> => {
        for (const record of event.Records) {
            let job: SegmentExportJob | undefined;

            try {
                job = parseSegmentExportJob(record.body);
                await dependencies.processJob(job);
                console.info(
                    JSON.stringify({
                        event: "segment_export_completed",
                        messageID: record.messageId,
                        exportID: job.exportID,
                        userID: job.userID,
                        segmentID: job.segmentID,
                    })
                );
            } catch (error: unknown) {
                const receiveCount = Number(
                    record.attributes.ApproximateReceiveCount ?? "1"
                );

                if (
                    job &&
                    receiveCount >= segmentExportMaximumReceiveCount
                ) {
                    await dependencies.markJobFailed(job, error);
                }

                console.error(
                    JSON.stringify({
                        event: "segment_export_failed",
                        messageID: record.messageId,
                        exportID: job?.exportID,
                        receiveCount,
                        terminal:
                            receiveCount >=
                            segmentExportMaximumReceiveCount,
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

type LiveResources = {
    storage: SegmentExportStorageProvider;
    persistence: ReturnType<typeof createPersistenceProvider>;
    dependencies: SegmentExportWorkerDependencies;
};

function createLiveResources(): LiveResources {
    const storage = createSegmentExportStorageProvider(
        getActiveVideoStorageProviderName()
    );
    const persistence = createPersistenceProvider();
    const processor = createStaticFFmpegSegmentExportProcessor();

    return {
        storage,
        persistence,
        dependencies: {
            processJob: (job) =>
                processSegmentExportJob({
                    job,
                    segmentExportDataAccess:
                        persistence.segmentExportDataAccess,
                    segmentExportStorageProvider: storage,
                    segmentExportProcessor: processor,
                }),
            async markJobFailed(job, error) {
                await persistence.segmentExportDataAccess
                    .markSegmentExportFailed({
                        userID: job.userID,
                        segmentID: job.segmentID,
                        exportID: job.exportID,
                        failureMessage:
                            error instanceof Error
                                ? error.message.slice(0, 500)
                                : "Segment export failed",
                        updatedAt: new Date(),
                    });
            },
        },
    };
}

let liveResources: LiveResources | undefined;

export const handler = async (event: SQSEvent): Promise<void> => {
    liveResources ??= createLiveResources();
    return createSegmentExportWorkerHandler(
        liveResources.dependencies
    )(event);
};
