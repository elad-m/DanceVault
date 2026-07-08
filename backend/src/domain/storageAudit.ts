export type StorageProvider = "minio" | "aws";

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
        provider: StorageProvider;
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
        provider: StorageProvider;
    };

export type HealthyStorageReference = {
    videoId: string;
    title: string;
    storageKey: string;
    provider: StorageProvider;
};

export type StorageAuditReport = {
    healthy: HealthyStorageReference[];
    issues: StorageAuditIssue[];
};

export type AuditStorageStateInput = {
    videos: AuditedVideo[];
    storageKeys: Record<
        StorageProvider,
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
        const existsInAws = storageKeys.aws.has(storageKey);

        if (existsInMinio && existsInAws) {
            issues.push({
                kind: "duplicate_object",
                videoId: video.id,
                title: video.title,
                storageKey,
            });
        }

        const provider: StorageProvider | null =
            existsInMinio && !existsInAws
                ? "minio"
                : existsInAws && !existsInMinio
                  ? "aws"
                  : null;

        if (video.status === "ready") {
            if (!existsInMinio && !existsInAws) {
                issues.push({
                    kind: "missing_object",
                    videoId: video.id,
                    title: video.title,
                    storageKey,
                });
            } else if (provider) {
                healthy.push({
                    videoId: video.id,
                    title: video.title,
                    storageKey,
                    provider,
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

        if (video.status === "upload_failed" && provider) {
            issues.push({
                kind: "failed_upload_has_object",
                videoId: video.id,
                title: video.title,
                storageKey,
                provider,
            });
        }
    }

    const providers: StorageProvider[] = ["minio", "aws"];

    for (const provider of providers) {
        const sortedStorageKeys = [...storageKeys[provider]].sort();

        for (const storageKey of sortedStorageKeys) {
            if (!referencedStorageKeys.has(storageKey)) {
                issues.push({
                    kind: "orphan_object",
                    provider,
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