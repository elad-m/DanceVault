import { describe, expect, it } from "vitest";
import type { UserIdentityProvider } from "../auth/userIdentityProvider";
import type { PersistenceProvider } from "../persistence";
import type { VideoDataAccessItem } from "../persistence/videoDataAccess";
import type { VideoStorageProvider } from "../storage";
import type { AccountDeletionJob } from "./accountDeletionQueue";
import { processAccountDeletionJob } from "./accountDeletionWorker";

const deletionRequestedAt = "2026-09-10T12:00:00.000Z";
const job: AccountDeletionJob = {
    schemaVersion: 1,
    jobID: "account-job-1",
    userID: "test-user-1",
    identityProviderUserID: "cognito-username-1",
    deletionRequestedAt,
};

function createWorkerTestContext(input: {
    lifecycleTimestamp?: string | null;
    identityError?: Error;
    storageSweepError?: Error;
    storageProviderName?: "minio" | "awsS3";
} = {}) {
    const events: string[] = [];
    const videos: VideoDataAccessItem[] = [
        {
            id: "video-1",
            userId: job.userID,
            environment: "local",
            title: "Lesson",
            storageKey: "users/test-user-1/videos/video-1.mp4",
            storageProvider: input.storageProviderName ?? "minio",
            originalFileName: "lesson.mp4",
            fileSizeBytes: 100,
            status: "ready",
            createdAt: new Date("2026-09-01T12:00:00.000Z"),
        },
    ];
    let deletionCompleted = false;
    let identityError = input.identityError ?? null;

    const userAccountDeletionDataAccess = {
        async deleteUserData() {
            events.push("remaining-data-deleted");
        },
        async completeUserAccountDeletion() {
            events.push("lifecycle-tombstone-written");
            deletionCompleted = true;
        },
    };

    const persistenceProvider: PersistenceProvider = {
        userAccountDataAccess: {
            async getUserAccountLifecycle() {
                events.push("lifecycle-read");

                if (deletionCompleted) {
                    return {
                        status: "deleted" as const,
                        deletionRequestedAt,
                    };
                }

                const timestamp = input.lifecycleTimestamp === undefined
                    ? deletionRequestedAt
                    : input.lifecycleTimestamp;

                return timestamp === null
                    ? {
                        status: "active" as const,
                        deletionRequestedAt: null,
                    }
                    : {
                        status: "deleting" as const,
                        deletionRequestedAt: timestamp,
                    };
            },
            async getUserLegalAcceptance() {
                return null;
            },
            async acceptLegalPolicies() {
                throw new Error("Not used by worker tests");
            },
            async startUserAccountDeletion() {
                throw new Error("Not used by worker tests");
            },
        },
        userAccountDeletionDataAccess,
        videoDataAccess: {
            async listVideos() {
                events.push("videos-listed");
                return [...videos];
            },
            async getVideoByID({ videoID }) {
                events.push("video-read");
                return videos.find((video) => video.id === videoID) ?? null;
            },
            async markVideoDeleting({ videoID }) {
                events.push("video-marked-deleting");
                const video = videos.find((item) => item.id === videoID);
                if (!video) throw new Error("Video missing");
                video.status = "deleting";
                return video;
            },
            async deleteVideo({ videoID }) {
                events.push("video-record-deleted");
                const index = videos.findIndex((video) => video.id === videoID);
                if (index >= 0) videos.splice(index, 1);
            },
            async createVideo() { throw new Error("Not used by worker tests"); },
            async updateVideoStatus() { throw new Error("Not used by worker tests"); },
            async finalizeVideoUpload() { throw new Error("Not used by worker tests"); },
            async markVideoUploadFailed() { throw new Error("Not used by worker tests"); },
            async listAllVideosForStorageAudit() { throw new Error("Not used by worker tests"); },
            async updateVideoTitle() { throw new Error("Not used by worker tests"); },
        },
        segmentDataAccess: {
            async listSegmentsByVideo() {
                events.push("segments-listed");
                return [];
            },
            async createSegment() { throw new Error("Not used by worker tests"); },
            async getSegmentByID() { throw new Error("Not used by worker tests"); },
            async listSegments() { throw new Error("Not used by worker tests"); },
            async updateSegmentMetadata() { throw new Error("Not used by worker tests"); },
            async deleteSegment() { throw new Error("Not used by worker tests"); },
        },
        mainListDataAccess: {
            async getMainList() { throw new Error("Not used by worker tests"); },
            async saveMainList() { throw new Error("Not used by worker tests"); },
        },
        async close() { },
    };

    const videoStorageProvider: VideoStorageProvider = {
        name: "minio",
        bucketName: "test-bucket",
        async deleteVideoObject() { events.push("video-object-deleted"); },
        async deleteVideoThumbnailObject() { events.push("video-thumbnail-deleted"); },
        async deleteSegmentThumbnailObject() { events.push("segment-thumbnail-deleted"); },
        async createVideoPlaybackUrl() { throw new Error("Not used by worker tests"); },
        async createVideoUploadUrl() { throw new Error("Not used by worker tests"); },
        async getVideoObjectSizeBytes() { throw new Error("Not used by worker tests"); },
        async createVideoThumbnailUploadUrl() { throw new Error("Not used by worker tests"); },
        async createVideoThumbnailPlaybackUrl() { throw new Error("Not used by worker tests"); },
        async getVideoThumbnailObjectSizeBytes() { throw new Error("Not used by worker tests"); },
        async createSegmentThumbnailUploadUrl() { throw new Error("Not used by worker tests"); },
        async createSegmentThumbnailPlaybackUrl() { throw new Error("Not used by worker tests"); },
        async getSegmentThumbnailObjectSizeBytes() { throw new Error("Not used by worker tests"); },
        async moveSegmentThumbnailObject() { throw new Error("Not used by worker tests"); },
        async listVideoObjectKeys() { throw new Error("Not used by worker tests"); },
        async deleteUserObjects() {
            events.push("user-storage-deleted");
            if (input.storageSweepError) {
                throw input.storageSweepError;
            }
        },
        close() { },
    };

    const userIdentityProvider: UserIdentityProvider = {
        async deleteUser() {
            events.push("identity-deleted");
            if (identityError) throw identityError;
        },
        close() { },
    };

    return {
        events,
        persistenceProvider,
        videoStorageProvider,
        userIdentityProvider,
        setIdentityError(error: Error | null) {
            identityError = error;
        },
    };
}

async function runWorker(context: ReturnType<typeof createWorkerTestContext>) {
    return processAccountDeletionJob({ job, ...context });
}

describe("processAccountDeletionJob", () => {
    it("deletes owned content, identity, and lifecycle marker in order", async () => {
        const context = createWorkerTestContext();

        await expect(runWorker(context)).resolves.toEqual({ kind: "deleted" });

        expect(context.events.indexOf("video-record-deleted")).toBeLessThan(
            context.events.indexOf("remaining-data-deleted")
        );
        expect(context.events.indexOf("remaining-data-deleted")).toBeLessThan(
            context.events.indexOf("user-storage-deleted")
        );
        expect(context.events.indexOf("user-storage-deleted")).toBeLessThan(
            context.events.indexOf("identity-deleted")
        );
        expect(context.events.indexOf("identity-deleted")).toBeLessThan(
            context.events.indexOf("lifecycle-tombstone-written")
        );
    });

    it("treats a repeated job as stale after writing the tombstone", async () => {
        const context = createWorkerTestContext();

        await runWorker(context);
        const completedEventCount = context.events.length;

        await expect(runWorker(context)).resolves.toEqual({ kind: "stale" });
        expect(context.events.slice(completedEventCount)).toEqual([
            "lifecycle-read",
        ]);
    });

    it("ignores a stale job whose request timestamp no longer matches", async () => {
        const context = createWorkerTestContext({
            lifecycleTimestamp: "2026-09-11T12:00:00.000Z",
        });

        await expect(runWorker(context)).resolves.toEqual({ kind: "stale" });
        expect(context.events).toEqual(["lifecycle-read"]);
    });

    it("preserves the lifecycle marker when identity deletion fails", async () => {
        const context = createWorkerTestContext({
            identityError: new Error("Identity provider unavailable"),
        });

        await expect(runWorker(context)).rejects.toThrow(
            "Identity provider unavailable"
        );
        expect(context.events).not.toContain("lifecycle-tombstone-written");

        context.setIdentityError(null);
        await expect(runWorker(context)).resolves.toEqual({ kind: "deleted" });
    });

    it("preserves the identity and lifecycle marker when the storage sweep fails", async () => {
        const context = createWorkerTestContext({
            storageSweepError: new Error("Storage unavailable"),
        });

        await expect(runWorker(context)).rejects.toThrow(
            "Storage unavailable"
        );
        expect(context.events).not.toContain("identity-deleted");
        expect(context.events).not.toContain("lifecycle-tombstone-written");
    });

    it("does not finalize an account containing an unsupported video", async () => {
        const context = createWorkerTestContext({
            storageProviderName: "awsS3",
        });

        await expect(runWorker(context)).rejects.toThrow(
            "Video belongs to a different storage provider"
        );
        expect(context.events).not.toContain("remaining-data-deleted");
        expect(context.events).not.toContain("identity-deleted");
        expect(context.events).not.toContain("lifecycle-tombstone-written");
    });
});
