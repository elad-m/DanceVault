// Performs video database operations and hides DynamoDB-specific item mapping.

import {
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createVideoItem,
    CURRENT_VIDEO_SCHEMA_VERSION,
    type CreateVideoItemInput,
    type VideoItem,
} from "./dynamoDBItems";
import { createVideoPrimaryKey } from "./dynamoDBKeys";

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

    if (result.Item.entityType !== "video") {
        throw new Error(
            "Expected the DynamoDB item to be a video"
        );
    }

    if (result.Item.schemaVersion !== CURRENT_VIDEO_SCHEMA_VERSION) {
        throw new Error(
            `Unsupported video schema version: ${String(
                result.Item.schemaVersion
            )}`
        );
    }

    return result.Item as VideoItem;
}