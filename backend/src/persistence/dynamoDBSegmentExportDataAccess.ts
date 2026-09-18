import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
    GetCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import { segmentExportJobLeaseMilliseconds } from "../domain/segmentExport";
import {
    CURRENT_SEGMENT_EXPORT_SCHEMA_VERSION,
    type ActiveSegmentExportItem,
    type SegmentExportItem,
} from "./dynamoDBItems";
import {
    createActiveSegmentExportPrimaryKey,
    createSegmentExportPrimaryKey,
} from "./dynamoDBKeys";
import type {
    CreateSegmentExportInput,
    CreateSegmentExportResult,
    SegmentExportDataAccess,
    SegmentExportDataAccessItem,
} from "./segmentExportDataAccess";

function requireSegmentExportItem(
    value: Record<string, unknown>
): SegmentExportItem {
    if (
        value.entityType !== "segmentExport" ||
        value.schemaVersion !== CURRENT_SEGMENT_EXPORT_SCHEMA_VERSION
    ) {
        throw new Error("Unsupported segment export record");
    }

    return value as SegmentExportItem;
}

function toDataAccessItem(
    item: SegmentExportItem
): SegmentExportDataAccessItem {
    return {
        id: item.exportID,
        segmentId: item.segmentID,
        videoId: item.videoID,
        sourceStorageKey: item.sourceStorageKey,
        outputStorageKey: item.outputStorageKey,
        startMilliseconds: item.startMilliseconds,
        endMilliseconds: item.endMilliseconds,
        status: item.status,
        ...(item.failureMessage === undefined
            ? {}
            : { failureMessage: item.failureMessage }),
        ...(item.outputSizeBytes === undefined
            ? {}
            : { outputSizeBytes: item.outputSizeBytes }),
        ...(item.expiresAt === undefined
            ? {}
            : { expiresAt: new Date(item.expiresAt * 1_000) }),
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
    };
}

function createExportItem(
    input: CreateSegmentExportInput
): SegmentExportItem {
    const createdAt = input.createdAt.toISOString();
    const expiresAt = Math.floor(
        (input.createdAt.getTime() +
            segmentExportJobLeaseMilliseconds) /
            1_000
    );

    return {
        ...createSegmentExportPrimaryKey(input),
        entityType: "segmentExport",
        schemaVersion: CURRENT_SEGMENT_EXPORT_SCHEMA_VERSION,
        exportID: input.exportID,
        userID: input.userID,
        segmentID: input.segmentID,
        videoID: input.videoID,
        sourceStorageKey: input.sourceStorageKey,
        outputStorageKey: input.outputStorageKey,
        startMilliseconds: input.startMilliseconds,
        endMilliseconds: input.endMilliseconds,
        status: "queued",
        expiresAt,
        createdAt,
        updatedAt: createdAt,
    };
}

async function getSegmentExportItem(
    connection: DynamoDBConnection,
    input: { userID: string; segmentID: string }
): Promise<SegmentExportItem | null> {
    const result = await connection.documentClient.send(
        new GetCommand({
            TableName: connection.tableName,
            Key: createSegmentExportPrimaryKey(input),
            ConsistentRead: true,
        })
    );

    return result.Item
        ? requireSegmentExportItem(result.Item)
        : null;
}

async function createSegmentExport(
    connection: DynamoDBConnection,
    input: CreateSegmentExportInput
): Promise<CreateSegmentExportResult> {
    const existing = await getSegmentExportItem(connection, input);

    if (
        existing &&
        existing.sourceStorageKey === input.sourceStorageKey &&
        existing.startMilliseconds === input.startMilliseconds &&
        existing.endMilliseconds === input.endMilliseconds &&
        existing.status !== "failed" &&
        (existing.expiresAt === undefined ||
            existing.expiresAt > input.createdAt.getTime() / 1_000)
    ) {
        return { kind: "existing", export: toDataAccessItem(existing) };
    }

    const exportItem = createExportItem(input);
    const activeItem: ActiveSegmentExportItem = {
        ...createActiveSegmentExportPrimaryKey(input.userID),
        entityType: "activeSegmentExport",
        schemaVersion: CURRENT_SEGMENT_EXPORT_SCHEMA_VERSION,
        exportID: input.exportID,
        segmentID: input.segmentID,
        expiresAt: exportItem.expiresAt!,
        createdAt: input.createdAt.toISOString(),
    };

    try {
        await connection.documentClient.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Put: {
                            TableName: connection.tableName,
                            Item: activeItem,
                            ConditionExpression:
                                "attribute_not_exists(PK) OR #expiresAt < :now",
                            ExpressionAttributeNames: {
                                "#expiresAt": "expiresAt",
                            },
                            ExpressionAttributeValues: {
                                ":now": Math.floor(
                                    input.createdAt.getTime() / 1_000
                                ),
                            },
                        },
                    },
                    {
                        Put: {
                            TableName: connection.tableName,
                            Item: exportItem,
                            ConditionExpression:
                                "attribute_not_exists(PK) OR #status = :failedStatus OR #expiresAt < :now",
                            ExpressionAttributeNames: {
                                "#status": "status",
                                "#expiresAt": "expiresAt",
                            },
                            ExpressionAttributeValues: {
                                ":failedStatus": "failed",
                                ":now": Math.floor(
                                    input.createdAt.getTime() / 1_000
                                ),
                            },
                        },
                    },
                ],
            })
        );
    } catch (error: unknown) {
        if (error instanceof TransactionCanceledException) {
            const racedExport = await getSegmentExportItem(
                connection,
                input
            );

            if (
                racedExport &&
                racedExport.sourceStorageKey === input.sourceStorageKey &&
                racedExport.startMilliseconds === input.startMilliseconds &&
                racedExport.endMilliseconds === input.endMilliseconds &&
                racedExport.status !== "failed"
            ) {
                return {
                    kind: "existing",
                    export: toDataAccessItem(racedExport),
                };
            }

            return { kind: "busy" };
        }

        throw error;
    }

    return { kind: "created", export: toDataAccessItem(exportItem) };
}

async function transitionExport(
    connection: DynamoDBConnection,
    input: {
        userID: string;
        segmentID: string;
        exportID: string;
        status: "ready" | "failed";
        updatedAt: Date;
        outputSizeBytes?: number;
        expiresAt?: Date;
        failureMessage?: string;
    }
): Promise<void> {
    const names: Record<string, string> = {
        "#status": "status",
        "#updatedAt": "updatedAt",
        "#exportID": "exportID",
    };
    const values: Record<string, unknown> = {
        ":status": input.status,
        ":updatedAt": input.updatedAt.toISOString(),
        ":exportID": input.exportID,
        ":queued": "queued",
        ":processing": "processing",
    };
    const assignments = ["#status = :status", "#updatedAt = :updatedAt"];

    if (input.outputSizeBytes !== undefined) {
        names["#outputSizeBytes"] = "outputSizeBytes";
        values[":outputSizeBytes"] = input.outputSizeBytes;
        assignments.push("#outputSizeBytes = :outputSizeBytes");
    }

    if (input.expiresAt !== undefined) {
        names["#expiresAt"] = "expiresAt";
        values[":expiresAt"] = Math.floor(
            input.expiresAt.getTime() / 1_000
        );
        assignments.push("#expiresAt = :expiresAt");
    }

    if (input.failureMessage !== undefined) {
        names["#failureMessage"] = "failureMessage";
        values[":failureMessage"] = input.failureMessage;
        assignments.push("#failureMessage = :failureMessage");
    }

    await connection.documentClient.send(
        new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: connection.tableName,
                        Key: createSegmentExportPrimaryKey(input),
                        UpdateExpression: `SET ${assignments.join(", ")}`,
                        ConditionExpression:
                            "#exportID = :exportID AND #status IN (:queued, :processing)",
                        ExpressionAttributeNames: names,
                        ExpressionAttributeValues: values,
                    },
                },
                {
                    Delete: {
                        TableName: connection.tableName,
                        Key: createActiveSegmentExportPrimaryKey(
                            input.userID
                        ),
                        ConditionExpression: "#exportID = :exportID",
                        ExpressionAttributeNames: {
                            "#exportID": "exportID",
                        },
                        ExpressionAttributeValues: {
                            ":exportID": input.exportID,
                        },
                    },
                },
            ],
        })
    );
}

export function createDynamoDBSegmentExportDataAccess(
    connection: DynamoDBConnection
): SegmentExportDataAccess {
    return {
        createSegmentExport: (input) =>
            createSegmentExport(connection, input),

        async getSegmentExport(input) {
            const item = await getSegmentExportItem(connection, input);
            return item ? toDataAccessItem(item) : null;
        },

        async markSegmentExportProcessing(input) {
            await connection.documentClient.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Update: {
                                TableName: connection.tableName,
                                Key: createSegmentExportPrimaryKey(input),
                                UpdateExpression:
                                    "SET #status = :processing, #updatedAt = :updatedAt",
                                ConditionExpression:
                                    "#exportID = :exportID AND #status IN (:queued, :processing)",
                                ExpressionAttributeNames: {
                                    "#status": "status",
                                    "#updatedAt": "updatedAt",
                                    "#exportID": "exportID",
                                },
                                ExpressionAttributeValues: {
                                    ":processing": "processing",
                                    ":queued": "queued",
                                    ":updatedAt": input.updatedAt.toISOString(),
                                    ":exportID": input.exportID,
                                },
                            },
                        },
                    ],
                })
            );
        },

        markSegmentExportReady: (input) =>
            transitionExport(connection, {
                ...input,
                status: "ready",
            }),

        markSegmentExportFailed: (input) =>
            transitionExport(connection, {
                ...input,
                status: "failed",
            }),

        async deleteSegmentExport(input) {
            await connection.documentClient.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Delete: {
                                TableName: connection.tableName,
                                Key: createSegmentExportPrimaryKey(input),
                                ConditionExpression:
                                    "#exportID = :exportID",
                                ExpressionAttributeNames: {
                                    "#exportID": "exportID",
                                },
                                ExpressionAttributeValues: {
                                    ":exportID": input.exportID,
                                },
                            },
                        },
                        {
                            Delete: {
                                TableName: connection.tableName,
                                Key: createActiveSegmentExportPrimaryKey(
                                    input.userID
                                ),
                                ConditionExpression:
                                    "attribute_not_exists(PK) OR #exportID = :exportID",
                                ExpressionAttributeNames: {
                                    "#exportID": "exportID",
                                },
                                ExpressionAttributeValues: {
                                    ":exportID": input.exportID,
                                },
                            },
                        },
                    ],
                })
            );
        },
    };
}
