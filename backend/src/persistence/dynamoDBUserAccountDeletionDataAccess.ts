import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    BatchWriteCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { deletedAccountTombstoneRetentionSeconds } from "../domain/userAccount";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import {
    createUserAccountPrimaryKey,
    createUserPartitionKey,
} from "./dynamoDBKeys";
import type { UserAccountDeletionDataAccess } from "./userAccountDeletionDataAccess";

const maximumBatchSize = 25;
const maximumBatchAttempts = 5;
const userAccountSchemaVersion = 1;

type PrimaryKey = {
    PK: string;
    SK: string;
};

async function listUserDataKeys(
    connection: DynamoDBConnection,
    userID: string
): Promise<PrimaryKey[]> {
    const accountKey = createUserAccountPrimaryKey(userID);
    const keys: PrimaryKey[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
        const result = await connection.documentClient.send(
            new QueryCommand({
                TableName: connection.tableName,
                KeyConditionExpression: "PK = :partitionKey",
                ExpressionAttributeValues: {
                    ":partitionKey": createUserPartitionKey(userID),
                },
                ProjectionExpression: "PK, SK",
                ConsistentRead: true,
                ExclusiveStartKey: exclusiveStartKey,
            })
        );

        for (const item of result.Items ?? []) {
            if (
                typeof item.PK !== "string" ||
                typeof item.SK !== "string"
            ) {
                throw new Error(
                    "Invalid user data key returned by DynamoDB"
                );
            }

            if (
                item.PK !== accountKey.PK ||
                item.SK !== accountKey.SK
            ) {
                keys.push({ PK: item.PK, SK: item.SK });
            }
        }

        exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return keys;
}

async function deleteKeyBatch(
    connection: DynamoDBConnection,
    keys: PrimaryKey[]
): Promise<void> {
    let pendingKeys = keys;

    for (
        let attempt = 1;
        pendingKeys.length > 0 &&
            attempt <= maximumBatchAttempts;
        attempt += 1
    ) {
        const result = await connection.documentClient.send(
            new BatchWriteCommand({
                RequestItems: {
                    [connection.tableName]: pendingKeys.map(
                        (Key) => ({
                            DeleteRequest: { Key },
                        })
                    ),
                },
            })
        );

        pendingKeys = (
            result.UnprocessedItems?.[connection.tableName] ?? []
        ).map((request) => {
            const key = request.DeleteRequest?.Key;

            if (
                typeof key?.PK !== "string" ||
                typeof key.SK !== "string"
            ) {
                throw new Error(
                    "DynamoDB returned an invalid unprocessed deletion"
                );
            }

            return { PK: key.PK, SK: key.SK };
        });
    }

    if (pendingKeys.length > 0) {
        throw new Error(
            "DynamoDB did not process every account deletion"
        );
    }
}

export function createDynamoDBUserAccountDeletionDataAccess(
    connection: DynamoDBConnection
): UserAccountDeletionDataAccess {
    return {
        async deleteUserData({ userID }) {
            const keys = await listUserDataKeys(
                connection,
                userID
            );

            for (
                let index = 0;
                index < keys.length;
                index += maximumBatchSize
            ) {
                await deleteKeyBatch(
                    connection,
                    keys.slice(index, index + maximumBatchSize)
                );
            }
        },

        async completeUserAccountDeletion({
            userID,
            deletionRequestedAt,
            completedAt,
        }) {
            const deletionCompletedAt = completedAt.toISOString();
            const expiresAt =
                Math.floor(completedAt.getTime() / 1_000) +
                deletedAccountTombstoneRetentionSeconds;

            try {
                await connection.documentClient.send(
                    new UpdateCommand({
                        TableName: connection.tableName,
                        Key: createUserAccountPrimaryKey(userID),
                        UpdateExpression:
                            "SET #status = :deletedStatus, " +
                            "#deletionCompletedAt = :deletionCompletedAt, " +
                            "#expiresAt = :expiresAt",
                        ConditionExpression:
                            "#entityType = :accountEntityType " +
                            "AND #schemaVersion = :accountSchemaVersion " +
                            "AND #status = :deletingStatus " +
                            "AND #deletionRequestedAt = :deletionRequestedAt",
                        ExpressionAttributeNames: {
                            "#entityType": "entityType",
                            "#schemaVersion": "schemaVersion",
                            "#status": "status",
                            "#deletionRequestedAt":
                                "deletionRequestedAt",
                            "#deletionCompletedAt":
                                "deletionCompletedAt",
                            "#expiresAt": "expiresAt",
                        },
                        ExpressionAttributeValues: {
                            ":accountEntityType": "userAccount",
                            ":accountSchemaVersion":
                                userAccountSchemaVersion,
                            ":deletingStatus": "deleting",
                            ":deletedStatus": "deleted",
                            ":deletionRequestedAt":
                                deletionRequestedAt,
                            ":deletionCompletedAt":
                                deletionCompletedAt,
                            ":expiresAt": expiresAt,
                        },
                    })
                );
            } catch (error) {
                if (error instanceof ConditionalCheckFailedException) {
                    throw new Error(
                        "Account deletion lifecycle no longer matches the job"
                    );
                }

                throw error;
            }
        },
    };
}
