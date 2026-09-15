import type { UserIdentityProvider } from "../auth/userIdentityProvider";
import type { PersistenceProvider } from "../persistence";
import { executeVideoDeletion } from "../services/videoService";
import type { VideoStorageProvider } from "../storage";
import type { AccountDeletionJob } from "./accountDeletionQueue";

type ProcessAccountDeletionJobInput = {
    job: AccountDeletionJob;
    videoStorageProvider: VideoStorageProvider;
    persistenceProvider: PersistenceProvider;
    userIdentityProvider: UserIdentityProvider;
};

export type ProcessAccountDeletionJobResult =
    | { kind: "stale" }
    | { kind: "deleted" };

export async function processAccountDeletionJob({
    job,
    videoStorageProvider,
    persistenceProvider,
    userIdentityProvider,
}: ProcessAccountDeletionJobInput):
    Promise<ProcessAccountDeletionJobResult> {
    const lifecycle =
        await persistenceProvider.userAccountDataAccess
            .getUserAccountLifecycle({
                userID: job.userID,
            });

    if (
        lifecycle?.status !== "deleting" ||
        lifecycle.deletionRequestedAt !==
            job.deletionRequestedAt
    ) {
        return { kind: "stale" };
    }

    const videos =
        await persistenceProvider.videoDataAccess.listVideos({
            userID: job.userID,
        });

    for (const video of videos) {
        const result = await executeVideoDeletion({
            videoId: video.id,
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

    await persistenceProvider.userAccountDeletionDataAccess.deleteUserData({
        userID: job.userID,
    });
    await videoStorageProvider.deleteUserObjects({
        userID: job.userID,
    });
    await userIdentityProvider.deleteUser({
        identityProviderUserID:
            job.identityProviderUserID,
    });
    await persistenceProvider.userAccountDeletionDataAccess
        .completeUserAccountDeletion({
            userID: job.userID,
            deletionRequestedAt: job.deletionRequestedAt,
            completedAt: new Date(),
        });

    return { kind: "deleted" };
}
