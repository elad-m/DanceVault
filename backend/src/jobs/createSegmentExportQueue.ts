import type { SegmentExportProcessor } from "../media/segmentExportProcessor";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import { runtime } from "../runtime";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";
import type {
    SegmentExportJob,
    SegmentExportQueue,
} from "./segmentExportQueue";
import { processSegmentExportJob } from "./segmentExportWorker";
import { createSQSSegmentExportQueue } from "./sqsSegmentExportQueue";

type CreateSegmentExportQueueInput = {
    segmentExportDataAccess: SegmentExportDataAccess;
    segmentExportStorageProvider: SegmentExportStorageProvider;
    segmentExportProcessor: SegmentExportProcessor;
};

export function createSegmentExportQueue(
    dependencies: CreateSegmentExportQueueInput
): SegmentExportQueue {
    if (runtime.environment === "dev") {
        return createSQSSegmentExportQueue();
    }

    let closed = false;

    return {
        async enqueue(job: SegmentExportJob) {
            if (closed) {
                throw new Error("Segment export queue is closed");
            }

            setImmediate(() => {
                void processSegmentExportJob({ job, ...dependencies })
                    .catch(async (error: unknown) => {
                        await dependencies.segmentExportDataAccess
                            .markSegmentExportFailed({
                                userID: job.userID,
                                segmentID: job.segmentID,
                                exportID: job.exportID,
                                failureMessage:
                                    error instanceof Error
                                        ? error.message.slice(0, 500)
                                        : "Segment export failed",
                                updatedAt: new Date(),
                            })
                            .catch((markError: unknown) => {
                                console.error(
                                    "Could not record local segment export failure",
                                    markError
                                );
                            });
                    });
            });
        },

        close() {
            closed = true;
        },
    };
}
