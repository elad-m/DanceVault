import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { UserAccountLifecycle } from "../domain/userAccount";
import type { DynamoDBConnection } from "./dynamoDBConnection";
import { createUserAccountPrimaryKey } from "./dynamoDBKeys";
import type { UserAccountDataAccess } from "./userAccountDataAccess";

const USER_ACCOUNT_SCHEMA_VERSION = 1;

function parseUserAccountLifecycle(
    item: Record<string, unknown> | undefined,
    userID: string
): UserAccountLifecycle | null {
    if (!item) {
        return null;
    }

    const status = item.status;
    const hasValidDeletionRequest =
        typeof item.deletionRequestedAt === "string" &&
        !Number.isNaN(Date.parse(item.deletionRequestedAt));
    const hasValidDeletionCompletion =
        typeof item.deletionCompletedAt === "string" &&
        !Number.isNaN(Date.parse(item.deletionCompletedAt)) &&
        typeof item.expiresAt === "number";
    const hasValidLifecycle =
        (status === "active" &&
            (item.deletionRequestedAt === undefined ||
                item.deletionRequestedAt === null)) ||
        (status === "deleting" && hasValidDeletionRequest) ||
        (status === "deleted" &&
            hasValidDeletionRequest &&
            hasValidDeletionCompletion);

    if (
        item.entityType !== "userAccount" ||
        item.schemaVersion !== USER_ACCOUNT_SCHEMA_VERSION ||
        item.userID !== userID ||
        (status !== "active" &&
            status !== "deleting" &&
            status !== "deleted") ||
        !hasValidLifecycle
    ) {
        throw new Error("Invalid user account database item");
    }

    return {
        status,
        deletionRequestedAt:
            typeof item.deletionRequestedAt === "string"
                ? item.deletionRequestedAt
                : null,
    };
}

export function createDynamoDBUserAccountDataAccess(
    connection: DynamoDBConnection
): UserAccountDataAccess {
    return {
        async getUserAccountLifecycle({ userID }) {
            const result = await connection.documentClient.send(
                new GetCommand({
                    TableName: connection.tableName,
                    Key: createUserAccountPrimaryKey(userID),
                    ConsistentRead: true,
                })
            );

            return parseUserAccountLifecycle(
                result.Item,
                userID
            );
        },

        async startUserAccountDeletion({ userID, requestedAt }) {
            const requestedAtTimestamp = requestedAt.toISOString();
            const result = await connection.documentClient.send(
                new UpdateCommand({
                    TableName: connection.tableName,
                    Key: createUserAccountPrimaryKey(userID),
                    UpdateExpression: [
                        "SET #entityType = if_not_exists(#entityType, :entityType)",
                        "#schemaVersion = if_not_exists(#schemaVersion, :schemaVersion)",
                        "#userID = if_not_exists(#userID, :userID)",
                        "#status = :deletingStatus",
                        "#deletionRequestedAt = if_not_exists(#deletionRequestedAt, :requestedAt)",
                    ].join(", "),
                    ConditionExpression: [
                        "attribute_not_exists(PK)",
                        "OR (#entityType = :entityType",
                        "AND #schemaVersion = :schemaVersion",
                        "AND #userID = :userID",
                        "AND (#status = :activeStatus OR #status = :deletingStatus))",
                    ].join(" "),
                    ExpressionAttributeNames: {
                        "#entityType": "entityType",
                        "#schemaVersion": "schemaVersion",
                        "#userID": "userID",
                        "#status": "status",
                        "#deletionRequestedAt": "deletionRequestedAt",
                    },
                    ExpressionAttributeValues: {
                        ":entityType": "userAccount",
                        ":schemaVersion": USER_ACCOUNT_SCHEMA_VERSION,
                        ":userID": userID,
                        ":activeStatus": "active",
                        ":deletingStatus": "deleting",
                        ":requestedAt": requestedAtTimestamp,
                    },
                    ReturnValues: "ALL_NEW",
                })
            );

            const lifecycle = parseUserAccountLifecycle(
                result.Attributes,
                userID
            );

            if (!lifecycle) {
                throw new Error(
                    "Account deletion update returned no account"
                );
            }

            return lifecycle;
        },
    };
}
