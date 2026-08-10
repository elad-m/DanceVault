import type { PersistenceProvider } from "../persistence";
import { executeVideoDeletion } from "../services/videoService";
import type { VideoStorageProvider } from "../storage";
import type { VideoDeletionJob } from "./videoDeletionQueue";

type ProcessVideoDeletionJobInput = {
    job: VideoDeletionJob;
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
};

export async function processVideoDeletionJob({
    job,
    videoStorageProvider,
    persistenceProvider,
}: ProcessVideoDeletionJobInput): Promise<void> {
    const result = await executeVideoDeletion({
        videoId: job.videoID,
        userId: job.userID,
        videoStorageProvider,
        videoDataAccess:
            persistenceProvider.videoDataAccess,
        segmentDataAccess:
            persistenceProvider.segmentDataAccess,
    });

    if (result.kind === "invalid_upload_state") {
        throw new Error(
            "Video belongs to a different storage provider"
        );
    }
}