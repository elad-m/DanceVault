// Performs video database operations and hides DynamoDB-specific item mapping.

import {
    GetCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createVideoItem,
    CURRENT_VIDEO_SCHEMA_VERSION,
    type CreateVideoItemInput,
    type VideoItem,
} from "./dynamoDBItems";
import {
    createUserPartitionKey,
    createVideoPrimaryKey,
    VIDEO_ITEM_KEY_PREFIX,
} from "./dynamoDBKeys";


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

function requireSupportedVideoItem(
    item: Record<string, unknown>
): VideoItem {
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

    return item as VideoItem;
}

export async function createVideo(
    connection: DynamoDBConnection,
    input: CreateVideoItemInput
): Promise<VideoItem> {
    const item = createVideoItem(input);

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
): Promise<VideoItem | null> {
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

    return requireSupportedVideoItem(result.Item);
}

type ListVideosInput = {
    userID: string;
    limit: number;
    cursor?: string;
};

export type VideoListPage = {
    videos: VideoItem[];
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
            requireSupportedVideoItem
        ),
        nextCursor,
    };
}
