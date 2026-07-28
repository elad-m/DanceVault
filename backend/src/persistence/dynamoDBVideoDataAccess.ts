// Performs video database operations and hides DynamoDB-specific item mapping.

import {
    DeleteCommand,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createDynamoDBVideoItem,
    CURRENT_VIDEO_SCHEMA_VERSION,
    type CreateDynamoDBVideoItemInput,
    type DynamoDBVideoItem,
} from "./dynamoDBItems";
import {
    createUserPartitionKey,
    createVideoPrimaryKey,
    VIDEO_ITEM_KEY_PREFIX,
} from "./dynamoDBKeys";
import type { VideoStatus } from "../domain/video";
import type {
    VideoDataAccess,
    VideoDataAccessItem,
} from "./videoDataAccess";


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
        status: item.status,
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
};

async function updateDynamoDBVideoItem(
    connection: DynamoDBConnection,
    input: UpdateDynamoDBVideoItemInput
): Promise<DynamoDBVideoItem> {
    const result = await connection.documentClient.send(
        new UpdateCommand({
            TableName: connection.tableName,
            Key: createVideoPrimaryKey(input),
            UpdateExpression: input.updateExpression,
            ConditionExpression:
                "attribute_exists(PK) " +
                "AND attribute_exists(SK) " +
                "AND #entityType = :videoEntityType " +
                "AND #schemaVersion = :schemaVersion",
            ExpressionAttributeNames: {
                ...input.expressionAttributeNames,
                "#entityType": "entityType",
                "#schemaVersion": "schemaVersion",
            },
            ExpressionAttributeValues: {
                ...input.expressionAttributeValues,
                ":videoEntityType": "video",
                ":schemaVersion":
                    CURRENT_VIDEO_SCHEMA_VERSION,
            },
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

export function createDynamoDBVideoDataAccess(
    connection: DynamoDBConnection
): VideoDataAccess {
    return {
        createVideo: async (input) => {
            const item = await createVideo(connection, {
                videoID: input.videoID,
                userID: input.userID,
                title: input.title,
                storageKey: input.storageKey,
                storageProviderName: input.storageProvider,
                originalFileName: input.originalFileName,
                status: input.status,
                createdAt: input.createdAt,
            });

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
    };
}
