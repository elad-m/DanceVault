import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {
    ConditionalCheckFailedException,
    TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import { createUserPartitionKey } from "./dynamoDBKeys";
import { MAX_MAIN_LIST_SEGMENTS, type MainListDataAccess } from "./mainListDataAccess";
import { createActiveUserAccountConditionCheck } from "./dynamoDBUserAccountConditions";

const MAIN_LIST_SCHEMA_VERSION = 1;

export function createDynamoDBMainListDataAccess(
    connection: DynamoDBConnection
): MainListDataAccess {
    const key = (userID: string) => ({
        PK: createUserPartitionKey(userID),
        SK: "MAIN_LIST",
    });

    return {
        async getMainList({ userID }) {
            const { Item: item } = await connection.documentClient.send(new GetCommand({
                TableName: connection.tableName,
                Key: key(userID),
                ConsistentRead: true,
            }));
            if (!item) return { segmentIDs: [], version: 0 };
            if (item.entityType !== "mainList" ||
                item.schemaVersion !== MAIN_LIST_SCHEMA_VERSION ||
                !Number.isSafeInteger(item.version) || item.version < 1 ||
                !Array.isArray(item.segmentIDs) ||
                item.segmentIDs.length > MAX_MAIN_LIST_SEGMENTS ||
                !item.segmentIDs.every((id: unknown) => typeof id === "string" && id.length > 0) ||
                new Set(item.segmentIDs).size !== item.segmentIDs.length) {
                throw new Error("Invalid Main List database item");
            }
            return { segmentIDs: item.segmentIDs as string[], version: item.version as number };
        },

        async saveMainList({ userID, segmentIDs, expectedVersion }) {
            if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 ||
                expectedVersion >= Number.MAX_SAFE_INTEGER ||
                segmentIDs.length > MAX_MAIN_LIST_SEGMENTS ||
                segmentIDs.some(id => !id) || new Set(segmentIDs).size !== segmentIDs.length) {
                throw new Error("Invalid Main List update");
            }
            const result = { segmentIDs, version: expectedVersion + 1 };
            try {
                await connection.documentClient.send(
                    new TransactWriteCommand({
                        TransactItems: [
                            createActiveUserAccountConditionCheck(
                                connection.tableName,
                                userID
                            ),
                            {
                                Put: {
                                    TableName: connection.tableName,
                                    Item: { ...key(userID), entityType: "mainList",
                                        schemaVersion: MAIN_LIST_SCHEMA_VERSION, ...result },
                                    // Creation must not replace an existing list; later saves compare its version.
                                    ConditionExpression: expectedVersion === 0
                                        ? "attribute_not_exists(PK)"
                                        : "#version = :expected AND entityType = :entity AND schemaVersion = :schema",
                                    ...(expectedVersion === 0 ? {} : {
                                        ExpressionAttributeNames: { "#version": "version" },
                                        ExpressionAttributeValues: { ":expected": expectedVersion,
                                            ":entity": "mainList", ":schema": MAIN_LIST_SCHEMA_VERSION },
                                    }),
                                },
                            },
                        ],
                    })
                );
                return result;
            } catch (error) {
                if (
                    error instanceof ConditionalCheckFailedException ||
                    error instanceof TransactionCanceledException
                ) return null;
                throw error;
            }
        },
    };
}
