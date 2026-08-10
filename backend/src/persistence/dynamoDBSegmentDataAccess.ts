// Performs segment database operations and hides DynamoDB-specific item mapping.
import {
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
    type QueryCommandInput,
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
    createUserPartitionKey,
} from "./dynamoDBKeys";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";
import type {
    SegmentDataAccess,
    SegmentDataAccessItem,
} from "./segmentDataAccess";

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

function toSegmentDataAccessItem(
    item: SegmentItem
): SegmentDataAccessItem {
    return {
        id: item.segmentID,
        videoId: item.videoID,
        name: item.name,
        description: item.description,
        startMilliseconds: item.startMilliseconds,
        endMilliseconds: item.endMilliseconds,
        tags: item.tags,
        difficulty: item.difficulty,
        confidence: item.confidence,
        practicePriority: item.practicePriority,
        createdAt: new Date(item.createdAt),
    };
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
                    Update: {
                        TableName: connection.tableName,
                        Key: videoKey,
                        UpdateExpression:
                            "ADD #segmentCount :segmentCountIncrement",
                        ConditionExpression:
                            "attribute_exists(PK) " +
                            "AND attribute_exists(SK) " +
                            "AND #entityType = :videoEntityType " +
                            "AND #schemaVersion = :videoSchemaVersion " +
                            "AND #status = :readyStatus",
                        ExpressionAttributeNames: {
                            "#entityType": "entityType",
                            "#schemaVersion": "schemaVersion",
                            "#segmentCount": "segmentCount",
                            "#status": "status",
                        },
                        ExpressionAttributeValues: {
                            ":videoEntityType": "video",
                            ":videoSchemaVersion":
                                CURRENT_VIDEO_SCHEMA_VERSION,
                            ":segmentCountIncrement": 1,
                            ":readyStatus": "ready",
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

type ListSegmentsByUserInput = {
    userID: string;
};

export async function listSegmentsByUser(
    connection: DynamoDBConnection,
    input: ListSegmentsByUserInput
): Promise<SegmentItem[]> {
    const segments: SegmentItem[] = [];
    let exclusiveStartKey:
        QueryCommandInput["ExclusiveStartKey"];

    do {
        const result = await connection.documentClient.send(
            new QueryCommand({
                TableName: connection.tableName,
                KeyConditionExpression:
                    "PK = :userPK " +
                    "AND begins_with(SK, :segmentPrefix)",
                ExpressionAttributeValues: {
                    ":userPK": createUserPartitionKey(
                        input.userID
                    ),
                    ":segmentPrefix":
                        SEGMENT_ITEM_KEY_PREFIX,
                },
                ExclusiveStartKey: exclusiveStartKey,
                ConsistentRead: true,
            })
        );

        segments.push(
            ...(result.Items ?? []).map(
                requireSupportedSegmentItem
            )
        );

        exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return segments;
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

type UpdateSegmentMetadataInput = {
    userID: string;
    segmentID: string;
    name?: string;
    description?: string | null;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};

export async function updateSegmentMetadata(
    connection: DynamoDBConnection,
    input: UpdateSegmentMetadataInput
): Promise<SegmentItem> {
    const metadata = {
        name: input.name,
        description: input.description,
        tags: input.tags,
        difficulty: input.difficulty,
        confidence: input.confidence,
        practicePriority: input.practicePriority,
    };

    const suppliedMetadata = Object.entries(metadata).filter(
        ([, value]) => value !== undefined
    );

    if (suppliedMetadata.length === 0) {
        throw new Error(
            "At least one segment metadata property must be supplied"
        );
    }

    const updateExpressions = suppliedMetadata.map(
        ([propertyName]) =>
            `#${propertyName} = :${propertyName}`
    );

    const expressionAttributeNames = Object.fromEntries([
        ["#entityType", "entityType"],
        ["#schemaVersion", "schemaVersion"],
        ...suppliedMetadata.map(([propertyName]) => [
            `#${propertyName}`,
            propertyName,
        ]),
    ]);

    const expressionAttributeValues = Object.fromEntries([
        [":segmentEntityType", "segment"],
        [
            ":segmentSchemaVersion",
            CURRENT_SEGMENT_SCHEMA_VERSION,
        ],
        ...suppliedMetadata.map(([propertyName, value]) => [
            `:${propertyName}`,
            value,
        ]),
    ]);

    const result = await connection.documentClient.send(
        new UpdateCommand({
            TableName: connection.tableName,
            Key: createSegmentPrimaryKey(input),
            UpdateExpression: `SET ${updateExpressions.join(", ")}`,
            ConditionExpression:
                "attribute_exists(PK) " +
                "AND attribute_exists(SK) " +
                "AND #entityType = :segmentEntityType " +
                "AND #schemaVersion = :segmentSchemaVersion",
            ExpressionAttributeNames:
                expressionAttributeNames,
            ExpressionAttributeValues:
                expressionAttributeValues,
            ReturnValues: "ALL_NEW",
        })
    );

    if (!result.Attributes) {
        throw new Error(
            "DynamoDB updated a segment without returning its new value"
        );
    }

    return requireSupportedSegmentItem(result.Attributes);
}

type DeleteSegmentInput = {
    userID: string;
    videoID: string;
    segmentID: string;
};

export async function deleteSegment(
    connection: DynamoDBConnection,
    input: DeleteSegmentInput
): Promise<void> {
    await connection.documentClient.send(
        new TransactWriteCommand({
            TransactItems: [
                {
                    Delete: {
                        TableName: connection.tableName,
                        Key: createSegmentPrimaryKey(input),
                        ConditionExpression:
                            "attribute_exists(PK) " +
                            "AND attribute_exists(SK) " +
                            "AND #entityType = :segmentEntityType " +
                            "AND #schemaVersion = :segmentSchemaVersion " +
                            "AND #videoID = :videoID",
                        ExpressionAttributeNames: {
                            "#entityType": "entityType",
                            "#schemaVersion": "schemaVersion",
                            "#videoID": "videoID",
                        },
                        ExpressionAttributeValues: {
                            ":segmentEntityType": "segment",
                            ":segmentSchemaVersion":
                                CURRENT_SEGMENT_SCHEMA_VERSION,
                            ":videoID": input.videoID,
                        },
                    },
                },
                {
                    Update: {
                        TableName: connection.tableName,
                        Key: createVideoPrimaryKey({
                            userID: input.userID,
                            videoID: input.videoID,
                        }),
                        UpdateExpression:
                            "ADD #segmentCount :segmentCountDecrement",
                        ConditionExpression:
                            "attribute_exists(PK) " +
                            "AND attribute_exists(SK) " +
                            "AND #entityType = :videoEntityType " +
                            "AND #schemaVersion = :videoSchemaVersion " +
                            "AND #segmentCount > :zero",
                        ExpressionAttributeNames: {
                            "#entityType": "entityType",
                            "#schemaVersion": "schemaVersion",
                            "#segmentCount": "segmentCount",
                        },
                        ExpressionAttributeValues: {
                            ":videoEntityType": "video",
                            ":videoSchemaVersion":
                                CURRENT_VIDEO_SCHEMA_VERSION,
                            ":segmentCountDecrement": -1,
                            ":zero": 0,
                        },
                    },
                },
            ],
        })
    );
}

export function createDynamoDBSegmentDataAccess(
    connection: DynamoDBConnection
): SegmentDataAccess {
    return {
        async createSegment(input) {
            const item = await createSegment(
                connection,
                input
            );

            return toSegmentDataAccessItem(item);
        },

        async getSegmentByID(input) {
            const item = await getSegmentByID(
                connection,
                input
            );

            return item
                ? toSegmentDataAccessItem(item)
                : null;
        },

        async listSegments({ userID }) {
            const items = await listSegmentsByUser(
                connection,
                {
                    userID,
                }
            );

            return items.map(toSegmentDataAccessItem);
        },

        async listSegmentsByVideo({
            userID,
            videoID,
        }) {
            const segments: SegmentDataAccessItem[] = [];
            let cursor: string | undefined;

            do {
                const page = await listSegmentsByVideo(
                    connection,
                    {
                        userID,
                        videoID,
                        limit: MAX_SEGMENTS_BY_VIDEO_PAGE_SIZE,
                        cursor,
                    }
                );

                segments.push(
                    ...page.segments.map(
                        toSegmentDataAccessItem
                    )
                );
                cursor = page.nextCursor ?? undefined;
            } while (cursor);

            return segments;
        },

        async updateSegmentMetadata(input) {
            const item = await updateSegmentMetadata(
                connection,
                input
            );

            return toSegmentDataAccessItem(item);
        },

        async deleteSegment(input) {
            await deleteSegment(connection, input);
        },
    };
}