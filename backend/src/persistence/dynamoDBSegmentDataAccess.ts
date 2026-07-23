// Performs segment database operations and hides DynamoDB-specific item mapping.

import {
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createSegmentItem,
    CURRENT_SEGMENT_SCHEMA_VERSION,
    CURRENT_VIDEO_SCHEMA_VERSION,
    type CreateSegmentItemInput,
    type SegmentItem,
} from "./dynamoDBItems";
import {
    createSegmentPrimaryKey,
    createSegmentsByVideoPartitionKey,
    createVideoPrimaryKey,
    SEGMENT_ITEM_KEY_PREFIX,
    createUserPartitionKey
} from "./dynamoDBKeys";

const SEGMENTS_BY_VIDEO_INDEX_NAME = "SegmentsByVideo";
export const MAX_SEGMENTS_BY_VIDEO_PAGE_SIZE = 50;

// API callers treat this cursor as opaque; only this module reads its DynamoDB keys.
type SegmentsByVideoListCursor = {
    PK: string;
    SK: string;
    VideoPK: string;
    VideoSK: string;
};

function isSegmentsByVideoListCursor(
    value: unknown
): value is SegmentsByVideoListCursor {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate.PK === "string" &&
        typeof candidate.SK === "string" &&
        typeof candidate.VideoPK === "string" &&
        typeof candidate.VideoSK === "string"
    );
}

function encodeSegmentsByVideoListCursor(
    cursor: SegmentsByVideoListCursor
): string {
    return Buffer.from(
        JSON.stringify(cursor),
        "utf8"
    ).toString("base64url");
}

function decodeSegmentsByVideoListCursor(
    cursor: string
): SegmentsByVideoListCursor {
    try {
        const decoded: unknown = JSON.parse(
            Buffer.from(cursor, "base64url").toString("utf8")
        );

        if (!isSegmentsByVideoListCursor(decoded)) {
            throw new Error();
        }

        return decoded;
    } catch {
        throw new Error(
            "Invalid segments-by-video list cursor"
        );
    }
}

function requireSupportedSegmentItem(
    item: Record<string, unknown>
): SegmentItem {
    if (item.entityType !== "segment") {
        throw new Error(
            "Expected the DynamoDB item to be a segment"
        );
    }

    if (
        item.schemaVersion !==
        CURRENT_SEGMENT_SCHEMA_VERSION
    ) {
        throw new Error(
            `Unsupported segment schema version: ${String(
                item.schemaVersion
            )}`
        );
    }

    return item as SegmentItem;
}

export async function createSegment(
    connection: DynamoDBConnection,
    input: CreateSegmentItemInput
): Promise<SegmentItem> {
    const segmentItem = createSegmentItem(input);
    const videoKey = createVideoPrimaryKey({
        userID: input.userID,
        videoID: input.videoID,
    });

    await connection.documentClient.send(
        new TransactWriteCommand({
            TransactItems: [
                {
                    ConditionCheck: {
                        TableName: connection.tableName,
                        Key: videoKey,
                        ConditionExpression:
                            "attribute_exists(PK) " +
                            "AND attribute_exists(SK) " +
                            "AND #entityType = :videoEntityType " +
                            "AND #schemaVersion = :videoSchemaVersion",
                        ExpressionAttributeNames: {
                            "#entityType": "entityType",
                            "#schemaVersion": "schemaVersion",
                        },
                        ExpressionAttributeValues: {
                            ":videoEntityType": "video",
                            ":videoSchemaVersion":
                                CURRENT_VIDEO_SCHEMA_VERSION,
                        },
                    },
                },
                {
                    Put: {
                        TableName: connection.tableName,
                        Item: segmentItem,
                        ConditionExpression:
                            "attribute_not_exists(PK) " +
                            "AND attribute_not_exists(SK)",
                    },
                },
            ],
        })
    );

    return segmentItem;
}

type GetSegmentByIDInput = {
    userID: string;
    segmentID: string;
};

export async function getSegmentByID(
    connection: DynamoDBConnection,
    input: GetSegmentByIDInput
): Promise<SegmentItem | null> {
    const result = await connection.documentClient.send(
        new GetCommand({
            TableName: connection.tableName,
            Key: createSegmentPrimaryKey(input),
            ConsistentRead: true,
        })
    );

    if (!result.Item) {
        return null;
    }

    return requireSupportedSegmentItem(result.Item);
}

type ListSegmentsByVideoInput = {
    userID: string;
    videoID: string;
    limit: number;
    cursor?: string;
};

export type SegmentsByVideoListPage = {
    segments: SegmentItem[];
    nextCursor: string | null;
};

export async function listSegmentsByVideo(
    connection: DynamoDBConnection,
    input: ListSegmentsByVideoInput
): Promise<SegmentsByVideoListPage> {
    if (
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > MAX_SEGMENTS_BY_VIDEO_PAGE_SIZE
    ) {
        throw new Error(
            `Segment list limit must be between 1 and ${MAX_SEGMENTS_BY_VIDEO_PAGE_SIZE}`
        );
    }

    const userPartitionKey = createUserPartitionKey(
        input.userID
    );
    const videoPartitionKey =
        createSegmentsByVideoPartitionKey(input);

    // DynamoDB resumes after this key, excluding the last item from the previous page.
    const exclusiveStartKey = input.cursor
        ? decodeSegmentsByVideoListCursor(input.cursor)
        : undefined;

    if (
        exclusiveStartKey &&
        (exclusiveStartKey.PK !== userPartitionKey ||
            exclusiveStartKey.VideoPK !== videoPartitionKey ||
            !exclusiveStartKey.SK.startsWith(
                SEGMENT_ITEM_KEY_PREFIX
            ) ||
            !exclusiveStartKey.VideoSK.startsWith(
                SEGMENT_ITEM_KEY_PREFIX
            ))
    ) {
        throw new Error(
            "Invalid segments-by-video list cursor"
        );
    }

    const result = await connection.documentClient.send(
        new QueryCommand({
            TableName: connection.tableName,
            IndexName: SEGMENTS_BY_VIDEO_INDEX_NAME,
            KeyConditionExpression:
                "VideoPK = :videoPK " +
                "AND begins_with(VideoSK, :segmentPrefix)",
            ExpressionAttributeValues: {
                ":videoPK": videoPartitionKey,
                ":segmentPrefix": SEGMENT_ITEM_KEY_PREFIX,
            },
            ScanIndexForward: true,
            Limit: input.limit,
            ExclusiveStartKey: exclusiveStartKey,
        })
    );

    let nextCursor: string | null = null;

    if (result.LastEvaluatedKey) {
        if (
            !isSegmentsByVideoListCursor(
                result.LastEvaluatedKey
            )
        ) {
            throw new Error(
                "DynamoDB returned an invalid segments-by-video cursor"
            );
        }

        nextCursor = encodeSegmentsByVideoListCursor(
            result.LastEvaluatedKey
        );
    }

    return {
        segments: (result.Items ?? []).map(
            requireSupportedSegmentItem
        ),
        nextCursor,
    };
}
