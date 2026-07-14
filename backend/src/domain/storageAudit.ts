import type { VideoStorageProviderName } from "./video";

export type AuditedVideo = {
    id: string;
    title: string;
    storageKey: string | null;
    status: "pending_upload" | "ready" | "upload_failed";
    createdAt: Date;
};

export type StorageAuditIssue =
    | {
        kind: "missing_storage_key";
        videoId: string;
        title: string;
    }
    | {
        kind: "missing_object";
        videoId: string;
        title: string;
        storageKey: string;
    }
    | {
        kind: "duplicate_object";
        videoId: string;
        title: string;
        storageKey: string;
    }
    | {
        kind: "orphan_object";
        providerName: VideoStorageProviderName;
        storageKey: string;
    }
    | {
        kind: "stale_pending_upload";
        videoId: string;
        title: string;
        storageKey: string;
    }
    | {
        kind: "failed_upload_has_object";
        videoId: string;
        title: string;
        storageKey: string;
        providerName: VideoStorageProviderName;
    };

export type HealthyStorageReference = {
    videoId: string;
    title: string;
    storageKey: string;
    providerName: VideoStorageProviderName;
};

export type StorageAuditReport = {
    healthy: HealthyStorageReference[];
    issues: StorageAuditIssue[];
};

export type AuditStorageStateInput = {
    videos: AuditedVideo[];
    storageKeys: Record<
        VideoStorageProviderName,
        ReadonlySet<string>
    >;
    now: Date;
    pendingUploadMaxAgeMilliseconds: number;
};


export function auditStorageState({
    videos,
    storageKeys,
    now,
    pendingUploadMaxAgeMilliseconds,
}: AuditStorageStateInput): StorageAuditReport {
    const healthy: HealthyStorageReference[] = [];
    const issues: StorageAuditIssue[] = [];

    const referencedStorageKeys = new Set(
        videos.flatMap((video) =>
            video.storageKey ? [video.storageKey] : []
        )
    );

    const sortedVideos = [...videos].sort((first, second) =>
        first.id.localeCompare(second.id)
    );

    for (const video of sortedVideos) {
        const storageKey = video.storageKey;

        if (!storageKey) {
            issues.push({
                kind: "missing_storage_key",
                videoId: video.id,
                title: video.title,
            });
            continue;
        }

        const existsInMinio = storageKeys.minio.has(storageKey);
        const existsInAwsS3 = storageKeys.awsS3.has(storageKey);

        if (existsInMinio && existsInAwsS3) {
            issues.push({
                kind: "duplicate_object",
                videoId: video.id,
                title: video.title,
                storageKey,
            });
        }

        const providerName: VideoStorageProviderName | null =
            existsInMinio && !existsInAwsS3
                ? "minio"
                : existsInAwsS3 && !existsInMinio
                  ? "awsS3"
                  : null;

        if (video.status === "ready") {
            if (!existsInMinio && !existsInAwsS3) {
                issues.push({
                    kind: "missing_object",
                    videoId: video.id,
                    title: video.title,
                    storageKey,
                });
            } else if (providerName) {
                healthy.push({
                    videoId: video.id,
                    title: video.title,
                    storageKey,
                    providerName,
                });
            }
        }

        const uploadAgeMilliseconds =
            now.getTime() - video.createdAt.getTime();

        if (
            video.status === "pending_upload" &&
            uploadAgeMilliseconds > pendingUploadMaxAgeMilliseconds
        ) {
            issues.push({
                kind: "stale_pending_upload",
                videoId: video.id,
                title: video.title,
                storageKey,
            });
        }

        if (video.status === "upload_failed" && providerName) {
            issues.push({
                kind: "failed_upload_has_object",
                videoId: video.id,
                title: video.title,
                storageKey,
                providerName,
            });
        }
    }

    const providerNames: VideoStorageProviderName[] = ["minio", "awsS3"];

    for (const providerName of providerNames) {
        const sortedStorageKeys = [...storageKeys[providerName]].sort();

        for (const storageKey of sortedStorageKeys) {
            if (!referencedStorageKeys.has(storageKey)) {
                issues.push({
                    kind: "orphan_object",
                    providerName,
                    storageKey,
                });
            }
        }
    }

    return {
        healthy,
        issues,
    };
}
