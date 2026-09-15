// Performs video database operations and hides DynamoDB-specific item mapping.

import {
    ConditionalCheckFailedException,
    TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
    DeleteCommand,
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createDynamoDBVideoItem,
    CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
    CURRENT_VIDEO_SCHEMA_VERSION,
    type CreateDynamoDBVideoItemInput,
    type DynamoDBVideoItem,
} from "./dynamoDBItems";
import {
    createUserPartitionKey,
    createUserQuotaUsagePrimaryKey,
    createVideoPrimaryKey,
    VIDEO_ITEM_KEY_PREFIX,
} from "./dynamoDBKeys";
import type { VideoStatus } from "../domain/video";
import {
    calculateVideoDeletionQuota,
    calculateVideoUploadCompletion,
    calculateVideoUploadFailure,
    calculateVideoUploadReservation,
    type VideoDeletionSourceStatus,
} from "../domain/userQuota";
import {
    getOrCreateUserQuotaUsage,
    getUserQuotaUsage,
} from "./dynamoDBUserQuotaUsageDataAccess";
import type {
    FinalizeVideoUploadDataAccessInput,
    VideoDataAccess,
    VideoDataAccessItem,
} from "./videoDataAccess";
import { createActiveUserAccountConditionCheck } from "./dynamoDBUserAccountConditions";


const USER_CONTENT_BY_CREATION_TIME_INDEX_NAME =
    "UserContentByCreationTime";

export const MAX_VIDEO_LIST_PAGE_SIZE = 50;

// API callers treat this cursor as opaque; only this module reads its DynamoDB keys.
type VideoListCursor = {
    PK: string;
    SK: string;
    UserContentPK: string;
    UserContentSK: string;
};

function isVideoListCursor(
    value: unknown
): value is VideoListCursor {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate.PK === "string" &&
        typeof candidate.SK === "string" &&
        typeof candidate.UserContentPK === "string" &&
        typeof candidate.UserContentSK === "string"
    );
}

function encodeVideoListCursor(
    cursor: VideoListCursor
): string {
    return Buffer.from(
        JSON.stringify(cursor),
        "utf8"
    ).toString("base64url");
}

function decodeVideoListCursor(
    cursor: string
): VideoListCursor {
    try {
        const decoded: unknown = JSON.parse(
            Buffer.from(cursor, "base64url").toString(
                "utf8"
            )
        );

        if (!isVideoListCursor(decoded)) {
            throw new Error();
        }

        return decoded;
    } catch {
        throw new Error("Invalid video list cursor");
    }
}

function requireSupportedDynamoDBVideoItem(
    item: Record<string, unknown>
): DynamoDBVideoItem {
    if (item.entityType !== "video") {
        throw new Error(
            "Expected the DynamoDB item to be a video"
        );
    }

    if (
        item.schemaVersion !==
        CURRENT_VIDEO_SCHEMA_VERSION
    ) {
        throw new Error(
            `Unsupported video schema version: ${String(
                item.schemaVersion
            )}`
        );
    }

    return item as DynamoDBVideoItem;
}

function toVideoDataAccessItem(
    item: DynamoDBVideoItem
): VideoDataAccessItem {
    return {
        id: item.videoID,
        userId: item.userID,
        environment: "dev",
        title: item.title,
        storageKey: item.storageKey,
        storageProvider: item.storageProviderName,
        originalFileName: item.originalFileName,
        fileSizeBytes: item.fileSizeBytes ?? null,
        status: item.status,
        ...(item.deletionSourceStatus === undefined
            ? {}
            : {
                deletionSourceStatus:
                    item.deletionSourceStatus,
            }),
        createdAt: new Date(item.createdAt),
    };
}

export async function createVideo(
    connection: DynamoDBConnection,
    input: CreateDynamoDBVideoItemInput
): Promise<DynamoDBVideoItem> {
    const item = createDynamoDBVideoItem(input);

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

type CreatePendingVideoWithQuotaReservationInput = Omit<
    CreateDynamoDBVideoItemInput,
    "fileSizeBytes" | "status"
> & {
    fileSizeBytes: number;
    status: "pending_upload";
};

const maximumVideoQuotaTransactionAttempts = 5;

export async function createPendingVideoWithQuotaReservation(
    connection: DynamoDBConnection,
    input: CreatePendingVideoWithQuotaReservationInput
): Promise<DynamoDBVideoItem> {
    const videoItem = createDynamoDBVideoItem(input);

    for (
        let attempt = 1;
        attempt <= maximumVideoQuotaTransactionAttempts;
        attempt += 1
    ) {
        const currentUsage = await getOrCreateUserQuotaUsage(
            connection,
            input.userID
        );
        const reservedUsage = calculateVideoUploadReservation({
            currentUsage,
            fileSizeBytes: input.fileSizeBytes,
        });

        try {
            await connection.documentClient.send(
                new TransactWriteCommand({
                    TransactItems: [
                        createActiveUserAccountConditionCheck(
                            connection.tableName,
                            input.userID
                        ),
                        {
                            Put: {
                                TableName: connection.tableName,
                                Item: videoItem,
                                ConditionExpression:
                                    "attribute_not_exists(PK) " +
                                    "AND attribute_not_exists(SK)",
                            },
                        },
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createUserQuotaUsagePrimaryKey(
                                    input.userID
                                ),
                                UpdateExpression:
                                    "SET #pendingVideoBytes = :reservedPendingVideoBytes, " +
                                    "#videoCount = :reservedVideoCount, " +
                                    "#pendingVideoUploadCount = :reservedPendingVideoUploadCount",
                                ConditionExpression:
                                    "#entityType = :quotaEntityType " +
                                    "AND #schemaVersion = :quotaSchemaVersion " +
                                    "AND #storedVideoBytes = :currentStoredVideoBytes " +
                                    "AND #pendingVideoBytes = :currentPendingVideoBytes " +
                                    "AND #videoCount = :currentVideoCount " +
                                    "AND #pendingVideoUploadCount = :currentPendingVideoUploadCount",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#storedVideoBytes":
                                        "storedVideoBytes",
                                    "#pendingVideoBytes":
                                        "pendingVideoBytes",
                                    "#videoCount": "videoCount",
                                    "#pendingVideoUploadCount":
                                        "pendingVideoUploadCount",
                                },
                                ExpressionAttributeValues: {
                                    ":quotaEntityType":
                                        "userQuotaUsage",
                                    ":quotaSchemaVersion":
                                        CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
                                    ":currentStoredVideoBytes":
                                        currentUsage.storedVideoBytes,
                                    ":currentPendingVideoBytes":
                                        currentUsage.pendingVideoBytes,
                                    ":currentVideoCount":
                                        currentUsage.videoCount,
                                    ":currentPendingVideoUploadCount":
                                        currentUsage.pendingVideoUploadCount,
                                    ":reservedPendingVideoBytes":
                                        reservedUsage.pendingVideoBytes,
                                    ":reservedVideoCount":
                                        reservedUsage.videoCount,
                                    ":reservedPendingVideoUploadCount":
                                        reservedUsage.pendingVideoUploadCount,
                                },
                            },
                        },
                    ],
                })
            );

            return videoItem;
        } catch (error: unknown) {
            if (
                !(error instanceof TransactionCanceledException) ||
                attempt === maximumVideoQuotaTransactionAttempts
            ) {
                throw error;
            }

            const existingVideo = await getVideoByID(
                connection,
                {
                    userID: input.userID,
                    videoID: input.videoID,
                }
            );

            if (existingVideo) {
                throw error;
            }
        }
    }

    throw new Error(
        "Video upload reservation exhausted its retry attempts"
    );
}

type GetVideoByIDInput = {
    userID: string;
    videoID: string;
};

export async function getVideoByID(
    connection: DynamoDBConnection,
    input: GetVideoByIDInput
): Promise<DynamoDBVideoItem | null> {
    const result = await connection.documentClient.send(
        new GetCommand({
            TableName: connection.tableName,
            Key: createVideoPrimaryKey(input),
            ConsistentRead: true,
        })
    );

    if (!result.Item) {
        return null;
    }

    return requireSupportedDynamoDBVideoItem(result.Item);
}

type ListVideosInput = {
    userID: string;
    limit: number;
    cursor?: string;
};

export type VideoListPage = {
    videos: DynamoDBVideoItem[];
    nextCursor: string | null;
};

export async function listVideos(
    connection: DynamoDBConnection,
    input: ListVideosInput
): Promise<VideoListPage> {
    if (
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > MAX_VIDEO_LIST_PAGE_SIZE
    ) {
        throw new Error(
            `Video list limit must be between 1 and ${MAX_VIDEO_LIST_PAGE_SIZE}`
        );
    }

    const userPartitionKey = createUserPartitionKey(
        input.userID
    );

    // DynamoDB resumes after this key, excluding the last item from the previous page.
    const exclusiveStartKey = input.cursor
        ? decodeVideoListCursor(input.cursor)
        : undefined;

    if (
        exclusiveStartKey &&
        (exclusiveStartKey.PK !== userPartitionKey ||
            exclusiveStartKey.UserContentPK !==
            userPartitionKey ||
            !exclusiveStartKey.SK.startsWith(
                VIDEO_ITEM_KEY_PREFIX
            ) ||
            !exclusiveStartKey.UserContentSK.startsWith(
                VIDEO_ITEM_KEY_PREFIX
            ))
    ) {
        throw new Error("Invalid video list cursor");
    }

    const result = await connection.documentClient.send(
        new QueryCommand({
            TableName: connection.tableName,
            IndexName:
                USER_CONTENT_BY_CREATION_TIME_INDEX_NAME,
            KeyConditionExpression:
                "UserContentPK = :userPK " +
                "AND begins_with(UserContentSK, :videoPrefix)",
            ExpressionAttributeValues: {
                ":userPK": userPartitionKey,
                ":videoPrefix": VIDEO_ITEM_KEY_PREFIX,
            },
            ScanIndexForward: true,
            Limit: input.limit,
            ExclusiveStartKey: exclusiveStartKey,
        })
    );

    let nextCursor: string | null = null;

    if (result.LastEvaluatedKey) {
        if (
            !isVideoListCursor(
                result.LastEvaluatedKey
            )
        ) {
            throw new Error(
                "DynamoDB returned an invalid video list cursor"
            );
        }

        nextCursor = encodeVideoListCursor(
            result.LastEvaluatedKey
        );
    }

    return {
        videos: (result.Items ?? []).map(
            requireSupportedDynamoDBVideoItem
        ),
        nextCursor,
    };
}

type UpdateDynamoDBVideoItemInput = {
    userID: string;
    videoID: string;
    updateExpression: string;
    expressionAttributeNames: Record<string, string>;
    expressionAttributeValues: Record<
        string,
        string | number
    >;
    additionalConditionExpression?: string;
    requireActiveAccount?: boolean;
};

async function updateDynamoDBVideoItem(
    connection: DynamoDBConnection,
    input: UpdateDynamoDBVideoItemInput
): Promise<DynamoDBVideoItem> {
    const update = {
        TableName: connection.tableName,
        Key: createVideoPrimaryKey(input),
        UpdateExpression: input.updateExpression,
        ConditionExpression:
            "attribute_exists(PK) " +
            "AND attribute_exists(SK) " +
            "AND #entityType = :videoEntityType " +
            "AND #schemaVersion = :schemaVersion" +
            (input.additionalConditionExpression
                ? ` AND ${input.additionalConditionExpression}`
                : ""),
        ExpressionAttributeNames: {
            ...input.expressionAttributeNames,
            "#entityType": "entityType",
            "#schemaVersion": "schemaVersion",
        },
        ExpressionAttributeValues: {
            ...input.expressionAttributeValues,
            ":videoEntityType": "video",
            ":schemaVersion": CURRENT_VIDEO_SCHEMA_VERSION,
        },
    };

    if (input.requireActiveAccount) {
        await connection.documentClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    createActiveUserAccountConditionCheck(
                        connection.tableName,
                        input.userID
                    ),
                    { Update: update },
                ],
            })
        );

        const updatedVideo = await getVideoByID(
            connection,
            input
        );

        if (!updatedVideo) {
            throw new Error(
                "DynamoDB did not return the updated video"
            );
        }

        return updatedVideo;
    }

    const result = await connection.documentClient.send(
        new UpdateCommand({
            ...update,
            ReturnValues: "ALL_NEW",
        })
    );

    if (!result.Attributes) {
        throw new Error(
            "DynamoDB did not return the updated video"
        );
    }

    return requireSupportedDynamoDBVideoItem(
        result.Attributes
    );
}

type UpdateVideoTitleInput = {
    userID: string;
    videoID: string;
    title: string;
};

export async function updateVideoTitle(
    connection: DynamoDBConnection,
    input: UpdateVideoTitleInput
): Promise<DynamoDBVideoItem> {
    return updateDynamoDBVideoItem(connection, {
        userID: input.userID,
        videoID: input.videoID,
        updateExpression: "SET #title = :title",
        expressionAttributeNames: {
            "#title": "title",
        },
        expressionAttributeValues: {
            ":title": input.title,
        },
        requireActiveAccount: true,
    });
}

type UpdateVideoStatusInput = {
    userID: string;
    videoID: string;
    status: VideoStatus;
};

export async function updateVideoStatus(
    connection: DynamoDBConnection,
    input: UpdateVideoStatusInput
): Promise<DynamoDBVideoItem> {
    return updateDynamoDBVideoItem(connection, {
        userID: input.userID,
        videoID: input.videoID,
        updateExpression: "SET #status = :status",
        expressionAttributeNames: {
            "#status": "status",
        },
        expressionAttributeValues: {
            ":status": input.status,
        },
    });
}

type MarkVideoDeletingInput = {
    userID: string;
    videoID: string;
};

export async function markVideoDeleting(
    connection: DynamoDBConnection,
    input: MarkVideoDeletingInput
): Promise<DynamoDBVideoItem> {
    for (
        let attempt = 1;
        attempt <= maximumVideoQuotaTransactionAttempts;
        attempt += 1
    ) {
        const video = await getVideoByID(connection, input);

        if (!video) {
            throw new Error("Video to delete was not found");
        }

        if (video.status === "deleting") {
            if (video.deletionSourceStatus) {
                return video;
            }

            throw new Error(
                "Deleting video does not preserve its source status"
            );
        }

        const sourceStatus: VideoDeletionSourceStatus =
            video.status;

        try {
            return await updateDynamoDBVideoItem(connection, {
                userID: input.userID,
                videoID: input.videoID,
                updateExpression:
                    "SET #status = :deletingStatus, " +
                    "#deletionSourceStatus = :sourceStatus",
                expressionAttributeNames: {
                    "#status": "status",
                    "#deletionSourceStatus":
                        "deletionSourceStatus",
                },
                expressionAttributeValues: {
                    ":deletingStatus": "deleting",
                    ":sourceStatus": sourceStatus,
                    ":currentStatus": sourceStatus,
                },
                additionalConditionExpression:
                    "#status = :currentStatus " +
                    "AND attribute_not_exists(#deletionSourceStatus)",
            });
        } catch (error: unknown) {
            if (
                !(error instanceof ConditionalCheckFailedException) ||
                attempt === maximumVideoQuotaTransactionAttempts
            ) {
                throw error;
            }
        }
    }

    throw new Error(
        "Video deletion status update exhausted its retry limit"
    );
}

export async function finalizeVideoUpload(
    connection: DynamoDBConnection,
    input: FinalizeVideoUploadDataAccessInput
): Promise<DynamoDBVideoItem> {
    return updateDynamoDBVideoItem(connection, {
        userID: input.userID,
        videoID: input.videoID,
        updateExpression:
            "SET #status = :readyStatus, #fileSizeBytes = :fileSizeBytes",
        expressionAttributeNames: {
            "#status": "status",
            "#fileSizeBytes": "fileSizeBytes",
        },
        expressionAttributeValues: {
            ":readyStatus": "ready",
            ":fileSizeBytes": input.fileSizeBytes,
        },
    });
}

export async function finalizeVideoUploadWithQuota(
    connection: DynamoDBConnection,
    input: FinalizeVideoUploadDataAccessInput
): Promise<DynamoDBVideoItem> {
    for (
        let attempt = 1;
        attempt <= maximumVideoQuotaTransactionAttempts;
        attempt += 1
    ) {
        const video = await getVideoByID(connection, input);

        if (!video) {
            throw new Error("Video upload was not found");
        }

        if (video.status === "ready") {
            if (video.fileSizeBytes === input.fileSizeBytes) {
                return video;
            }

            throw new Error(
                "Completed video has a different storage-verified file size"
            );
        }

        if (video.status !== "pending_upload") {
            throw new Error(
                `Video upload cannot be completed from status ${video.status}`
            );
        }

        if (video.fileSizeBytes === undefined) {
            throw new Error(
                "Pending video does not contain its reserved file size"
            );
        }

        const currentUsage = await getUserQuotaUsage(
            connection,
            input.userID
        );

        if (!currentUsage) {
            throw new Error(
                "User quota usage was not found for the pending video"
            );
        }

        const completedUsage = calculateVideoUploadCompletion({
            currentUsage,
            reservedFileSizeBytes: video.fileSizeBytes,
            actualFileSizeBytes: input.fileSizeBytes,
        });

        try {
            await connection.documentClient.send(
                new TransactWriteCommand({
                    TransactItems: [
                        createActiveUserAccountConditionCheck(
                            connection.tableName,
                            input.userID
                        ),
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createVideoPrimaryKey(input),
                                UpdateExpression:
                                    "SET #status = :readyStatus, " +
                                    "#fileSizeBytes = :actualFileSizeBytes",
                                ConditionExpression:
                                    "#entityType = :videoEntityType " +
                                    "AND #schemaVersion = :videoSchemaVersion " +
                                    "AND #status = :pendingStatus " +
                                    "AND #fileSizeBytes = :reservedFileSizeBytes",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#status": "status",
                                    "#fileSizeBytes":
                                        "fileSizeBytes",
                                },
                                ExpressionAttributeValues: {
                                    ":videoEntityType": "video",
                                    ":videoSchemaVersion":
                                        CURRENT_VIDEO_SCHEMA_VERSION,
                                    ":pendingStatus":
                                        "pending_upload",
                                    ":readyStatus": "ready",
                                    ":reservedFileSizeBytes":
                                        video.fileSizeBytes,
                                    ":actualFileSizeBytes":
                                        input.fileSizeBytes,
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createUserQuotaUsagePrimaryKey(
                                    input.userID
                                ),
                                UpdateExpression:
                                    "SET #storedVideoBytes = :completedStoredVideoBytes, " +
                                    "#pendingVideoBytes = :completedPendingVideoBytes, " +
                                    "#pendingVideoUploadCount = :completedPendingVideoUploadCount",
                                ConditionExpression:
                                    "#entityType = :quotaEntityType " +
                                    "AND #schemaVersion = :quotaSchemaVersion " +
                                    "AND #storedVideoBytes = :currentStoredVideoBytes " +
                                    "AND #pendingVideoBytes = :currentPendingVideoBytes " +
                                    "AND #pendingVideoUploadCount = :currentPendingVideoUploadCount",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#storedVideoBytes":
                                        "storedVideoBytes",
                                    "#pendingVideoBytes":
                                        "pendingVideoBytes",
                                    "#pendingVideoUploadCount":
                                        "pendingVideoUploadCount",
                                },
                                ExpressionAttributeValues: {
                                    ":quotaEntityType":
                                        "userQuotaUsage",
                                    ":quotaSchemaVersion":
                                        CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
                                    ":currentStoredVideoBytes":
                                        currentUsage.storedVideoBytes,
                                    ":currentPendingVideoBytes":
                                        currentUsage.pendingVideoBytes,
                                    ":currentPendingVideoUploadCount":
                                        currentUsage.pendingVideoUploadCount,
                                    ":completedStoredVideoBytes":
                                        completedUsage.storedVideoBytes,
                                    ":completedPendingVideoBytes":
                                        completedUsage.pendingVideoBytes,
                                    ":completedPendingVideoUploadCount":
                                        completedUsage.pendingVideoUploadCount,
                                },
                            },
                        },
                    ],
                })
            );

            const completedVideo = await getVideoByID(
                connection,
                input
            );

            if (!completedVideo) {
                throw new Error(
                    "Completed video disappeared after its transaction"
                );
            }

            return completedVideo;
        } catch (error: unknown) {
            if (
                !(error instanceof TransactionCanceledException) ||
                attempt === maximumVideoQuotaTransactionAttempts
            ) {
                throw error;
            }
        }
    }

    throw new Error(
        "Video upload completion exhausted its retry attempts"
    );
}

type MarkVideoUploadFailedWithQuotaInput = {
    userID: string;
    videoID: string;
};

export async function markVideoUploadFailedWithQuota(
    connection: DynamoDBConnection,
    input: MarkVideoUploadFailedWithQuotaInput
): Promise<DynamoDBVideoItem> {
    for (
        let attempt = 1;
        attempt <= maximumVideoQuotaTransactionAttempts;
        attempt += 1
    ) {
        const video = await getVideoByID(connection, input);

        if (!video) {
            throw new Error("Video upload was not found");
        }

        if (video.status === "upload_failed") {
            return video;
        }

        if (video.status !== "pending_upload") {
            throw new Error(
                `Video upload cannot fail from status ${video.status}`
            );
        }

        if (video.fileSizeBytes === undefined) {
            throw new Error(
                "Pending video does not contain its reserved file size"
            );
        }

        const currentUsage = await getUserQuotaUsage(
            connection,
            input.userID
        );

        if (!currentUsage) {
            throw new Error(
                "User quota usage was not found for the pending video"
            );
        }

        const failedUsage = calculateVideoUploadFailure({
            currentUsage,
            reservedFileSizeBytes: video.fileSizeBytes,
        });

        try {
            await connection.documentClient.send(
                new TransactWriteCommand({
                    TransactItems: [
                        createActiveUserAccountConditionCheck(
                            connection.tableName,
                            input.userID
                        ),
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createVideoPrimaryKey(input),
                                UpdateExpression:
                                    "SET #status = :failedStatus",
                                ConditionExpression:
                                    "#entityType = :videoEntityType " +
                                    "AND #schemaVersion = :videoSchemaVersion " +
                                    "AND #status = :pendingStatus " +
                                    "AND #fileSizeBytes = :reservedFileSizeBytes",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#status": "status",
                                    "#fileSizeBytes":
                                        "fileSizeBytes",
                                },
                                ExpressionAttributeValues: {
                                    ":videoEntityType": "video",
                                    ":videoSchemaVersion":
                                        CURRENT_VIDEO_SCHEMA_VERSION,
                                    ":pendingStatus":
                                        "pending_upload",
                                    ":failedStatus":
                                        "upload_failed",
                                    ":reservedFileSizeBytes":
                                        video.fileSizeBytes,
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createUserQuotaUsagePrimaryKey(
                                    input.userID
                                ),
                                UpdateExpression:
                                    "SET #pendingVideoBytes = :failedPendingVideoBytes, " +
                                    "#pendingVideoUploadCount = :failedPendingVideoUploadCount",
                                ConditionExpression:
                                    "#entityType = :quotaEntityType " +
                                    "AND #schemaVersion = :quotaSchemaVersion " +
                                    "AND #pendingVideoBytes = :currentPendingVideoBytes " +
                                    "AND #pendingVideoUploadCount = :currentPendingVideoUploadCount",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#pendingVideoBytes":
                                        "pendingVideoBytes",
                                    "#pendingVideoUploadCount":
                                        "pendingVideoUploadCount",
                                },
                                ExpressionAttributeValues: {
                                    ":quotaEntityType":
                                        "userQuotaUsage",
                                    ":quotaSchemaVersion":
                                        CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
                                    ":currentPendingVideoBytes":
                                        currentUsage.pendingVideoBytes,
                                    ":currentPendingVideoUploadCount":
                                        currentUsage.pendingVideoUploadCount,
                                    ":failedPendingVideoBytes":
                                        failedUsage.pendingVideoBytes,
                                    ":failedPendingVideoUploadCount":
                                        failedUsage.pendingVideoUploadCount,
                                },
                            },
                        },
                    ],
                })
            );

            const failedVideo = await getVideoByID(
                connection,
                input
            );

            if (!failedVideo) {
                throw new Error(
                    "Failed video disappeared after its transaction"
                );
            }

            return failedVideo;
        } catch (error: unknown) {
            if (
                !(error instanceof TransactionCanceledException) ||
                attempt === maximumVideoQuotaTransactionAttempts
            ) {
                throw error;
            }
        }
    }

    throw new Error(
        "Video upload failure exhausted its retry attempts"
    );
}

type BackfillVideoFileSizeBytesInput = {
    userID: string;
    videoID: string;
    fileSizeBytes: number;
};

export async function backfillVideoFileSizeBytes(
    connection: DynamoDBConnection,
    input: BackfillVideoFileSizeBytesInput
): Promise<DynamoDBVideoItem> {
    try {
        return await updateDynamoDBVideoItem(connection, {
            userID: input.userID,
            videoID: input.videoID,
            updateExpression:
                "SET #fileSizeBytes = :fileSizeBytes",
            expressionAttributeNames: {
                "#fileSizeBytes": "fileSizeBytes",
            },
            expressionAttributeValues: {
                ":fileSizeBytes": input.fileSizeBytes,
            },
            additionalConditionExpression:
                "attribute_not_exists(#fileSizeBytes)",
        });
    } catch (error: unknown) {
        if (
            !(error instanceof ConditionalCheckFailedException)
        ) {
            throw error;
        }

        const existingVideo = await getVideoByID(connection, {
            userID: input.userID,
            videoID: input.videoID,
        });

        if (
            existingVideo?.fileSizeBytes ===
            input.fileSizeBytes
        ) {
            return existingVideo;
        }

        throw error;
    }
}

type DeleteVideoInput = {
    userID: string;
    videoID: string;
};

export async function deleteVideo(
    connection: DynamoDBConnection,
    input: DeleteVideoInput
): Promise<DynamoDBVideoItem> {
    const result = await connection.documentClient.send(
        new DeleteCommand({
            TableName: connection.tableName,
            Key: createVideoPrimaryKey(input),
            ConditionExpression:
                "attribute_exists(PK) " +
                "AND attribute_exists(SK) " +
                "AND #entityType = :videoEntityType " +
                "AND #schemaVersion = :schemaVersion " +
                "AND #segmentCount = :zero",
            ExpressionAttributeNames: {
                "#entityType": "entityType",
                "#schemaVersion": "schemaVersion",
                "#segmentCount": "segmentCount",
            },
            ExpressionAttributeValues: {
                ":videoEntityType": "video",
                ":schemaVersion":
                    CURRENT_VIDEO_SCHEMA_VERSION,
                ":zero": 0,
            },
            ReturnValues: "ALL_OLD",
        })
    );

    if (!result.Attributes) {
        throw new Error(
            "DynamoDB deleted a video without returning its previous value"
        );
    }

    return requireSupportedDynamoDBVideoItem(
        result.Attributes
    );
}

export async function deleteVideoWithQuota(
    connection: DynamoDBConnection,
    input: DeleteVideoInput
): Promise<void> {
    for (
        let attempt = 1;
        attempt <= maximumVideoQuotaTransactionAttempts;
        attempt += 1
    ) {
        const video = await getVideoByID(connection, input);

        if (!video) {
            return;
        }

        if (
            video.status !== "deleting" ||
            !video.deletionSourceStatus
        ) {
            throw new Error(
                "Video must preserve its source status before deletion"
            );
        }

        if (video.segmentCount !== 0) {
            throw new Error(
                "Video cannot be deleted while it contains segments"
            );
        }

        const currentUsage = await getUserQuotaUsage(
            connection,
            input.userID
        );

        if (!currentUsage) {
            throw new Error(
                "User quota usage was not found for video deletion"
            );
        }

        const deletedUsage = calculateVideoDeletionQuota({
            currentUsage,
            sourceStatus: video.deletionSourceStatus,
            fileSizeBytes: video.fileSizeBytes ?? null,
        });

        try {
            await connection.documentClient.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Delete: {
                                TableName: connection.tableName,
                                Key: createVideoPrimaryKey(input),
                                ConditionExpression:
                                    "attribute_exists(PK) " +
                                    "AND attribute_exists(SK) " +
                                    "AND #entityType = :videoEntityType " +
                                    "AND #schemaVersion = :videoSchemaVersion " +
                                    "AND #status = :deletingStatus " +
                                    "AND #deletionSourceStatus = :deletionSourceStatus " +
                                    "AND #segmentCount = :zero",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#status": "status",
                                    "#deletionSourceStatus":
                                        "deletionSourceStatus",
                                    "#segmentCount": "segmentCount",
                                },
                                ExpressionAttributeValues: {
                                    ":videoEntityType": "video",
                                    ":videoSchemaVersion":
                                        CURRENT_VIDEO_SCHEMA_VERSION,
                                    ":deletingStatus": "deleting",
                                    ":deletionSourceStatus":
                                        video.deletionSourceStatus,
                                    ":zero": 0,
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createUserQuotaUsagePrimaryKey(
                                    input.userID
                                ),
                                UpdateExpression:
                                    "SET #storedVideoBytes = :deletedStoredVideoBytes, " +
                                    "#pendingVideoBytes = :deletedPendingVideoBytes, " +
                                    "#videoCount = :deletedVideoCount, " +
                                    "#pendingVideoUploadCount = :deletedPendingVideoUploadCount",
                                ConditionExpression:
                                    "attribute_exists(PK) " +
                                    "AND attribute_exists(SK) " +
                                    "AND #entityType = :quotaEntityType " +
                                    "AND #schemaVersion = :quotaSchemaVersion " +
                                    "AND #storedVideoBytes = :currentStoredVideoBytes " +
                                    "AND #pendingVideoBytes = :currentPendingVideoBytes " +
                                    "AND #videoCount = :currentVideoCount " +
                                    "AND #pendingVideoUploadCount = :currentPendingVideoUploadCount",
                                ExpressionAttributeNames: {
                                    "#entityType": "entityType",
                                    "#schemaVersion": "schemaVersion",
                                    "#storedVideoBytes":
                                        "storedVideoBytes",
                                    "#pendingVideoBytes":
                                        "pendingVideoBytes",
                                    "#videoCount": "videoCount",
                                    "#pendingVideoUploadCount":
                                        "pendingVideoUploadCount",
                                },
                                ExpressionAttributeValues: {
                                    ":quotaEntityType":
                                        "userQuotaUsage",
                                    ":quotaSchemaVersion":
                                        CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
                                    ":currentStoredVideoBytes":
                                        currentUsage.storedVideoBytes,
                                    ":currentPendingVideoBytes":
                                        currentUsage.pendingVideoBytes,
                                    ":currentVideoCount":
                                        currentUsage.videoCount,
                                    ":currentPendingVideoUploadCount":
                                        currentUsage.pendingVideoUploadCount,
                                    ":deletedStoredVideoBytes":
                                        deletedUsage.storedVideoBytes,
                                    ":deletedPendingVideoBytes":
                                        deletedUsage.pendingVideoBytes,
                                    ":deletedVideoCount":
                                        deletedUsage.videoCount,
                                    ":deletedPendingVideoUploadCount":
                                        deletedUsage.pendingVideoUploadCount,
                                },
                            },
                        },
                    ],
                })
            );

            return;
        } catch (error: unknown) {
            if (
                !(error instanceof TransactionCanceledException) ||
                attempt === maximumVideoQuotaTransactionAttempts
            ) {
                throw error;
            }
        }
    }

    throw new Error(
        "Video deletion exhausted its retry attempts"
    );
}

export function createDynamoDBVideoDataAccess(
    connection: DynamoDBConnection
): VideoDataAccess {
    return {
        createVideo: async (input) => {
            const item =
                await createPendingVideoWithQuotaReservation(
                    connection,
                    {
                        videoID: input.videoID,
                        userID: input.userID,
                        title: input.title,
                        storageKey: input.storageKey,
                        storageProviderName:
                            input.storageProvider,
                        originalFileName:
                            input.originalFileName,
                        fileSizeBytes: input.fileSizeBytes,
                        status: input.status,
                        createdAt: input.createdAt,
                    }
                );

            return toVideoDataAccessItem(item);
        },

        async updateVideoStatus(input) {
            const item = await updateVideoStatus(
                connection,
                input
            );

            return toVideoDataAccessItem(item);
        },

        async finalizeVideoUpload(input) {
            const item = await finalizeVideoUploadWithQuota(
                connection,
                input
            );

            return toVideoDataAccessItem(item);
        },

        async markVideoUploadFailed(input) {
            const item = await markVideoUploadFailedWithQuota(
                connection,
                input
            );

            return toVideoDataAccessItem(item);
        },

        async markVideoDeleting(input) {
            const item = await markVideoDeleting(
                connection,
                input
            );

            return toVideoDataAccessItem(item);
        },

        async getVideoByID(input) {
            const item = await getVideoByID(
                connection,
                input
            );

            return item
                ? toVideoDataAccessItem(item)
                : null;
        },

        async listVideos({ userID }) {
            const videos: VideoDataAccessItem[] = [];
            let cursor: string | undefined;

            do {
                const page = await listVideos(connection, {
                    userID,
                    limit: MAX_VIDEO_LIST_PAGE_SIZE,
                    cursor,
                });

                videos.push(
                    ...page.videos.map(
                        toVideoDataAccessItem
                    )
                );
                cursor = page.nextCursor ?? undefined;
            } while (cursor);

            return videos;
        },

        async listAllVideosForStorageAudit() {
            const videos: VideoDataAccessItem[] = [];
            let exclusiveStartKey:
                | Record<string, unknown>
                | undefined;

            do {
                const result =
                    await connection.documentClient.send(
                        new ScanCommand({
                            TableName: connection.tableName,
                            FilterExpression:
                                "#entityType = :videoEntityType",
                            ExpressionAttributeNames: {
                                "#entityType": "entityType",
                            },
                            ExpressionAttributeValues: {
                                ":videoEntityType": "video",
                            },
                            ExclusiveStartKey:
                                exclusiveStartKey,
                        })
                    );

                videos.push(
                    ...(result.Items ?? []).map(
                        requireSupportedDynamoDBVideoItem
                    ).map(toVideoDataAccessItem)
                );
                exclusiveStartKey =
                    result.LastEvaluatedKey;
            } while (exclusiveStartKey);

            return videos.sort(
                (left, right) =>
                    left.createdAt.getTime() -
                    right.createdAt.getTime()
            );
        },

        async updateVideoTitle(input) {
            const item = await updateVideoTitle(
                connection,
                input
            );

            return toVideoDataAccessItem(item);
        },
        async deleteVideo(input) {
            await deleteVideoWithQuota(connection, input);
        },
    };
}
