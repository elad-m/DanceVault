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
};

export async function listVideos(
    connection: DynamoDBConnection,
    input: ListVideosInput
): Promise<VideoItem[]> {
    const result = await connection.documentClient.send(
        new QueryCommand({
            TableName: connection.tableName,
            IndexName:
                USER_CONTENT_BY_CREATION_TIME_INDEX_NAME,
            KeyConditionExpression:
                "UserContentPK = :userPK " +
                "AND begins_with(UserContentSK, :videoPrefix)",
            ExpressionAttributeValues: {
                ":userPK": createUserPartitionKey(
                    input.userID
                ),
                ":videoPrefix": VIDEO_ITEM_KEY_PREFIX,
            },
            ScanIndexForward: true,
        })
    );

    return (result.Items ?? []).map(
        requireSupportedVideoItem
    );
}
