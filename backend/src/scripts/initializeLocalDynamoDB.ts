import {
    CreateTableCommand,
    DescribeTableCommand,
    DynamoDBClient,
    ResourceNotFoundException,
    waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { createDynamoDBClientConfiguration } from "../persistence/dynamoDBConnection";
import { assertLocalServiceEndpoint } from "../testEnvironmentSafety";

function requireTableName(): string {
    const tableName = process.env.DYNAMODB_TABLE_NAME;

    if (!tableName) {
        throw new Error(
            "DYNAMODB_TABLE_NAME is not configured"
        );
    }

    return tableName;
}

async function tableExists(
    client: DynamoDBClient,
    tableName: string
): Promise<boolean> {
    try {
        await client.send(
            new DescribeTableCommand({
                TableName: tableName,
            })
        );

        return true;
    } catch (error) {
        if (error instanceof ResourceNotFoundException) {
            return false;
        }

        throw error;
    }
}

async function main() {
    assertLocalServiceEndpoint({
        serviceName: "Local DynamoDB initialization",
        endpoint: process.env.DYNAMODB_ENDPOINT,
    });

    const tableName = requireTableName();
    const client = new DynamoDBClient(
        createDynamoDBClientConfiguration()
    );

    try {
        if (await tableExists(client, tableName)) {
            console.log(
                `Local DynamoDB table already exists: ${tableName}`
            );
            return;
        }

        await client.send(
            new CreateTableCommand({
                TableName: tableName,
                BillingMode: "PAY_PER_REQUEST",
                AttributeDefinitions: [
                    {
                        AttributeName: "PK",
                        AttributeType: "S",
                    },
                    {
                        AttributeName: "SK",
                        AttributeType: "S",
                    },
                    {
                        AttributeName: "VideoPK",
                        AttributeType: "S",
                    },
                    {
                        AttributeName: "VideoSK",
                        AttributeType: "S",
                    },
                    {
                        AttributeName: "UserContentPK",
                        AttributeType: "S",
                    },
                    {
                        AttributeName: "UserContentSK",
                        AttributeType: "S",
                    },
                ],
                KeySchema: [
                    {
                        AttributeName: "PK",
                        KeyType: "HASH",
                    },
                    {
                        AttributeName: "SK",
                        KeyType: "RANGE",
                    },
                ],
                GlobalSecondaryIndexes: [
                    {
                        IndexName: "SegmentsByVideo",
                        KeySchema: [
                            {
                                AttributeName: "VideoPK",
                                KeyType: "HASH",
                            },
                            {
                                AttributeName: "VideoSK",
                                KeyType: "RANGE",
                            },
                        ],
                        Projection: {
                            ProjectionType: "ALL",
                        },
                    },
                    {
                        IndexName: "UserContentByCreationTime",
                        KeySchema: [
                            {
                                AttributeName: "UserContentPK",
                                KeyType: "HASH",
                            },
                            {
                                AttributeName: "UserContentSK",
                                KeyType: "RANGE",
                            },
                        ],
                        Projection: {
                            ProjectionType: "ALL",
                        },
                    },
                ],
            })
        );

        await waitUntilTableExists(
            {
                client,
                maxWaitTime: 30,
                minDelay: 1,
                maxDelay: 2,
            },
            {
                TableName: tableName,
            }
        );

        console.log(
            `Created local DynamoDB table: ${tableName}`
        );
    } finally {
        client.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
