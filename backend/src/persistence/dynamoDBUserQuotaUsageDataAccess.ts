// Persists and validates the aggregate counters used for per-user quotas.

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    GetCommand,
    PutCommand,
    ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
    QuotaCountedVideo,
    UserQuotaUsage,
} from "../domain/userQuota";
import type { VideoStorageProviderName } from "../domain/video";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createDynamoDBUserQuotaUsageItem,
    CURRENT_SEGMENT_SCHEMA_VERSION,
    CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
    CURRENT_VIDEO_SCHEMA_VERSION,
    type CreateDynamoDBUserQuotaUsageItemInput,
    type DynamoDBUserQuotaUsageItem,
    type DynamoDBVideoItem,
    type SegmentItem,
} from "./dynamoDBItems";
import { createUserQuotaUsagePrimaryKey } from "./dynamoDBKeys";

function parseDynamoDBUserQuotaUsageItem(
    item: Record<string, unknown>
): DynamoDBUserQuotaUsageItem {
    if (item.entityType !== "userQuotaUsage") {
        throw new Error(
            "Expected the DynamoDB item to contain user quota usage"
        );
    }

    if (
        item.schemaVersion !==
        CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION
    ) {
        throw new Error(
            `Unsupported user quota usage schema version: ${String(
                item.schemaVersion
            )}`
        );
    }

    return item as DynamoDBUserQuotaUsageItem;
}

export async function createUserQuotaUsage(
    connection: DynamoDBConnection,
    input: CreateDynamoDBUserQuotaUsageItemInput
): Promise<DynamoDBUserQuotaUsageItem> {
    const item = createDynamoDBUserQuotaUsageItem(input);

    await connection.documentClient.send(
        new PutCommand({
            TableName: connection.tableName,
            Item: item,
            ConditionExpression:
                "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        })
    );

    return item;
}

export async function getUserQuotaUsage(
    connection: DynamoDBConnection,
    userID: string
): Promise<DynamoDBUserQuotaUsageItem | null> {
    const result = await connection.documentClient.send(
        new GetCommand({
            TableName: connection.tableName,
            Key: createUserQuotaUsagePrimaryKey(userID),
            ConsistentRead: true,
        })
    );

    if (!result.Item) {
        return null;
    }

    return parseDynamoDBUserQuotaUsageItem(
        result.Item
    );
}

export async function getOrCreateUserQuotaUsage(
    connection: DynamoDBConnection,
    userID: string
): Promise<DynamoDBUserQuotaUsageItem> {
    const existingUsage = await getUserQuotaUsage(
        connection,
        userID
    );

    if (existingUsage) {
        return existingUsage;
    }

    try {
        return await createUserQuotaUsage(connection, {
            userID,
            storedVideoBytes: 0,
            pendingVideoBytes: 0,
            videoCount: 0,
            segmentCount: 0,
            pendingVideoUploadCount: 0,
        });
    } catch (error: unknown) {
        if (
            !(error instanceof ConditionalCheckFailedException)
        ) {
            throw error;
        }

        const concurrentlyCreatedUsage =
            await getUserQuotaUsage(connection, userID);

        if (concurrentlyCreatedUsage) {
            return concurrentlyCreatedUsage;
        }

        throw error;
    }
}

function userQuotaUsageItemMatchesInput(
    item: DynamoDBUserQuotaUsageItem,
    input: CreateDynamoDBUserQuotaUsageItemInput
): boolean {
    return (
        item.userID === input.userID &&
        item.storedVideoBytes === input.storedVideoBytes &&
        item.pendingVideoBytes === input.pendingVideoBytes &&
        item.videoCount === input.videoCount &&
        item.segmentCount === input.segmentCount &&
        item.pendingVideoUploadCount ===
            input.pendingVideoUploadCount
    );
}

export async function backfillUserQuotaUsage(
    connection: DynamoDBConnection,
    input: CreateDynamoDBUserQuotaUsageItemInput
): Promise<DynamoDBUserQuotaUsageItem> {
    try {
        return await createUserQuotaUsage(connection, input);
    } catch (error: unknown) {
        if (
            !(error instanceof ConditionalCheckFailedException)
        ) {
            throw error;
        }

        const existingUsage = await getUserQuotaUsage(
            connection,
            input.userID
        );

        if (
            existingUsage &&
            userQuotaUsageItemMatchesInput(existingUsage, input)
        ) {
            return existingUsage;
        }

        throw error;
    }
}

export type UserQuotaReconciliationSource = {
    userID: string;
    videos: Array<
        QuotaCountedVideo & {
            storageKey: string;
            storageProviderName: VideoStorageProviderName;
        }
    >;
    segmentCount: number;
    persistedUsage: UserQuotaUsage | null;
};

function getUserQuotaUsageValues(
    item: DynamoDBUserQuotaUsageItem
): UserQuotaUsage {
    return {
        storedVideoBytes: item.storedVideoBytes,
        pendingVideoBytes: item.pendingVideoBytes,
        videoCount: item.videoCount,
        segmentCount: item.segmentCount,
        pendingVideoUploadCount:
            item.pendingVideoUploadCount,
    };
}

// Operational full-table scan; never use this in a request handler.
export async function listUserQuotaReconciliationSources(
    connection: DynamoDBConnection
): Promise<UserQuotaReconciliationSource[]> {
    const sourcesByUserID = new Map<
        string,
        UserQuotaReconciliationSource
    >();
    let exclusiveStartKey:
        | Record<string, unknown>
        | undefined;

    function getSource(
        userID: string
    ): UserQuotaReconciliationSource {
        const existingSource = sourcesByUserID.get(userID);

        if (existingSource) {
            return existingSource;
        }

        const source: UserQuotaReconciliationSource = {
            userID,
            videos: [],
            segmentCount: 0,
            persistedUsage: null,
        };
        sourcesByUserID.set(userID, source);
        return source;
    }

    do {
        const result = await connection.documentClient.send(
            new ScanCommand({
                TableName: connection.tableName,
                ConsistentRead: true,
                ExclusiveStartKey: exclusiveStartKey,
            })
        );

        for (const rawItem of result.Items ?? []) {
            if (rawItem.entityType === "video") {
                if (
                    rawItem.schemaVersion !==
                    CURRENT_VIDEO_SCHEMA_VERSION
                ) {
                    throw new Error(
                        `Unsupported video schema version: ${String(
                            rawItem.schemaVersion
                        )}`
                    );
                }

                const video = rawItem as DynamoDBVideoItem;
                getSource(video.userID).videos.push({
                    id: video.videoID,
                    status: video.status,
                    fileSizeBytes:
                        video.fileSizeBytes ?? null,
                    storageKey: video.storageKey,
                    storageProviderName:
                        video.storageProviderName,
                });
                continue;
            }

            if (rawItem.entityType === "segment") {
                if (
                    rawItem.schemaVersion !==
                    CURRENT_SEGMENT_SCHEMA_VERSION
                ) {
                    throw new Error(
                        `Unsupported segment schema version: ${String(
                            rawItem.schemaVersion
                        )}`
                    );
                }

                const segment = rawItem as SegmentItem;
                getSource(segment.userID).segmentCount += 1;
                continue;
            }

            if (rawItem.entityType === "userQuotaUsage") {
                const quotaUsage =
                    parseDynamoDBUserQuotaUsageItem(rawItem);
                getSource(quotaUsage.userID).persistedUsage =
                    getUserQuotaUsageValues(quotaUsage);
            }
        }

        exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return [...sourcesByUserID.values()]
        .map((source) => ({
            ...source,
            videos: [...source.videos].sort((first, second) =>
                first.id.localeCompare(second.id)
            ),
        }))
        .sort((first, second) =>
            first.userID.localeCompare(second.userID)
        );
}
