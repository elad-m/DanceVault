import { createUserAccountPrimaryKey } from "./dynamoDBKeys";

const USER_ACCOUNT_SCHEMA_VERSION = 1;

export function createActiveUserAccountConditionCheck(
    tableName: string,
    userID: string
) {
    return {
        ConditionCheck: {
            TableName: tableName,
            Key: createUserAccountPrimaryKey(userID),
            ConditionExpression:
                "attribute_not_exists(PK) OR (" +
                "#entityType = :accountEntityType " +
                "AND #schemaVersion = :accountSchemaVersion " +
                "AND #status = :activeStatus)",
            ExpressionAttributeNames: {
                "#entityType": "entityType",
                "#schemaVersion": "schemaVersion",
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":accountEntityType": "userAccount",
                ":accountSchemaVersion":
                    USER_ACCOUNT_SCHEMA_VERSION,
                ":activeStatus": "active",
            },
        },
    };
}
