import {
    reconcileUserQuotaUsage,
    type UserQuotaReconciliationReport,
    type UserQuotaUsage,
} from "../domain/userQuota";
import {
    createDynamoDBConnection,
    type DynamoDBConnection,
} from "../persistence/dynamoDBConnection";
import { backfillVideoFileSizeBytes } from "../persistence/dynamoDBVideoDataAccess";
import {
    backfillUserQuotaUsage,
    listUserQuotaReconciliationSources,
    type UserQuotaReconciliationSource,
} from "../persistence/dynamoDBUserQuotaUsageDataAccess";
import {
    createVideoStorageProvider,
    getActiveVideoStorageProviderName,
    type VideoStorageProvider,
} from "../storage";

type ResolvedVideoFileSize = {
    userID: string;
    videoID: string;
    storageKey: string;
    fileSizeBytes: number;
};

type VideoFileSizeResolutionIssue =
    | {
        kind: "storage_provider_mismatch";
        userID: string;
        videoID: string;
        persistedProviderName: string;
        activeProviderName: string;
    }
    | {
        kind: "missing_storage_object";
        userID: string;
        videoID: string;
        storageKey: string;
    };

export type UserQuotaAuditCommandOptions =
    | {
        mode: "audit";
    }
    | {
        mode: "apply";
        confirmedTableName: string;
    };

export function parseUserQuotaAuditCommandOptions(
    commandArguments: string[]
): UserQuotaAuditCommandOptions {
    if (commandArguments.length === 0) {
        return { mode: "audit" };
    }

    const confirmationArgument = commandArguments.find(
        (argument) => argument.startsWith("--confirm-table=")
    );
    const confirmedTableName = confirmationArgument?.slice(
        "--confirm-table=".length
    );

    if (
        commandArguments.length !== 2 ||
        !commandArguments.includes("--apply") ||
        !confirmedTableName
    ) {
        throw new Error(
            "Usage: auditUserQuotaUsage.ts [--apply --confirm-table=<exact table name>]"
        );
    }

    return {
        mode: "apply",
        confirmedTableName,
    };
}

export function createUserQuotaUsageBackfillInputs(
    report: UserQuotaReconciliationReport
): Array<UserQuotaUsage & { userID: string }> {
    const blockingIssues = report.issues.filter(
        (issue) => issue.kind !== "missing_persisted_usage"
    );

    if (blockingIssues.length > 0) {
        throw new Error(
            `Quota backfill is blocked by reconciliation issues: ${JSON.stringify(
                blockingIssues
            )}`
        );
    }

    return report.issues
        .filter(
            (issue) => issue.kind === "missing_persisted_usage"
        )
        .map((issue) => ({
            userID: issue.userID,
            ...issue.expectedUsage,
        }));
}

async function resolveMissingVideoFileSizes(
    sources: UserQuotaReconciliationSource[],
    videoStorageProvider: VideoStorageProvider
): Promise<{
    sources: UserQuotaReconciliationSource[];
    resolvedFileSizes: ResolvedVideoFileSize[];
    issues: VideoFileSizeResolutionIssue[];
}> {
    const resolvedFileSizes: ResolvedVideoFileSize[] = [];
    const issues: VideoFileSizeResolutionIssue[] = [];
    const resolvedSources: UserQuotaReconciliationSource[] = [];

    for (const source of sources) {
        const resolvedVideos = [];

        for (const video of source.videos) {
            if (
                video.fileSizeBytes !== null ||
                video.status === "upload_failed"
            ) {
                resolvedVideos.push(video);
                continue;
            }

            if (
                video.storageProviderName !==
                videoStorageProvider.name
            ) {
                issues.push({
                    kind: "storage_provider_mismatch",
                    userID: source.userID,
                    videoID: video.id,
                    persistedProviderName:
                        video.storageProviderName,
                    activeProviderName:
                        videoStorageProvider.name,
                });
                resolvedVideos.push(video);
                continue;
            }

            const fileSizeBytes =
                await videoStorageProvider.getVideoObjectSizeBytes(
                    video.storageKey
                );

            if (fileSizeBytes === null) {
                issues.push({
                    kind: "missing_storage_object",
                    userID: source.userID,
                    videoID: video.id,
                    storageKey: video.storageKey,
                });
                resolvedVideos.push(video);
                continue;
            }

            resolvedFileSizes.push({
                userID: source.userID,
                videoID: video.id,
                storageKey: video.storageKey,
                fileSizeBytes,
            });
            resolvedVideos.push({
                ...video,
                fileSizeBytes,
            });
        }

        resolvedSources.push({
            ...source,
            videos: resolvedVideos,
        });
    }

    return {
        sources: resolvedSources,
        resolvedFileSizes,
        issues,
    };
}

type UserQuotaAuditSnapshot = {
    sources: UserQuotaReconciliationSource[];
    resolvedFileSizes: ResolvedVideoFileSize[];
    fileSizeResolutionIssues: VideoFileSizeResolutionIssue[];
    report: UserQuotaReconciliationReport;
};

async function createUserQuotaAuditSnapshot(
    connection: DynamoDBConnection,
    videoStorageProvider: VideoStorageProvider
): Promise<UserQuotaAuditSnapshot> {
    const sources =
        await listUserQuotaReconciliationSources(connection);
    const fileSizeResolution =
        await resolveMissingVideoFileSizes(
            sources,
            videoStorageProvider
        );

    return {
        sources,
        resolvedFileSizes:
            fileSizeResolution.resolvedFileSizes,
        fileSizeResolutionIssues:
            fileSizeResolution.issues,
        report: reconcileUserQuotaUsage(
            fileSizeResolution.sources
        ),
    };
}

function createSnapshotOutput(
    snapshot: UserQuotaAuditSnapshot
): Record<string, unknown> {
    return {
        userCount: snapshot.sources.length,
        resolvedFileSizes: snapshot.resolvedFileSizes,
        fileSizeResolutionIssues:
            snapshot.fileSizeResolutionIssues,
        ...snapshot.report,
    };
}

async function main(): Promise<void> {
    const options = parseUserQuotaAuditCommandOptions(
        process.argv.slice(2)
    );
    const connection = createDynamoDBConnection();
    const videoStorageProvider = createVideoStorageProvider(
        getActiveVideoStorageProviderName()
    );

    try {
        if (
            options.mode === "apply" &&
            options.confirmedTableName !== connection.tableName
        ) {
            throw new Error(
                `Confirmed table ${options.confirmedTableName} does not match configured table ${connection.tableName}`
            );
        }

        const before = await createUserQuotaAuditSnapshot(
            connection,
            videoStorageProvider
        );

        if (options.mode === "audit") {
            console.log(
                JSON.stringify(
                    {
                        mode: options.mode,
                        tableName: connection.tableName,
                        activeStorageProviderName:
                            videoStorageProvider.name,
                        ...createSnapshotOutput(before),
                    },
                    null,
                    2
                )
            );
            return;
        }

        if (before.fileSizeResolutionIssues.length > 0) {
            throw new Error(
                `Quota backfill is blocked by storage issues: ${JSON.stringify(
                    before.fileSizeResolutionIssues
                )}`
            );
        }

        const quotaUsageBackfills =
            createUserQuotaUsageBackfillInputs(before.report);

        for (const video of before.resolvedFileSizes) {
            await backfillVideoFileSizeBytes(connection, {
                userID: video.userID,
                videoID: video.videoID,
                fileSizeBytes: video.fileSizeBytes,
            });
        }

        for (const quotaUsage of quotaUsageBackfills) {
            await backfillUserQuotaUsage(
                connection,
                quotaUsage
            );
        }

        const after = await createUserQuotaAuditSnapshot(
            connection,
            videoStorageProvider
        );

        if (
            after.resolvedFileSizes.length > 0 ||
            after.fileSizeResolutionIssues.length > 0 ||
            after.report.issues.length > 0
        ) {
            throw new Error(
                `Quota backfill verification failed: ${JSON.stringify(
                    createSnapshotOutput(after)
                )}`
            );
        }

        console.log(
            JSON.stringify(
                {
                    mode: options.mode,
                    tableName: connection.tableName,
                    activeStorageProviderName:
                        videoStorageProvider.name,
                    before: createSnapshotOutput(before),
                    after: createSnapshotOutput(after),
                },
                null,
                2
            )
        );
    } finally {
        videoStorageProvider.close();
        connection.close();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
