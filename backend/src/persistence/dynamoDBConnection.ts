import "dotenv/config";
import {
    DynamoDBClient,
    type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

export type DynamoDBConnection = {
    tableName: string;
    documentClient: DynamoDBDocumentClient;
    close(): void;
};

function requireEnvironmentVariable(
    variableName: string
): string {
    const value = process.env[variableName];

    if (!value) {
        throw new Error(
            `${variableName} is not configured`
        );
    }

    return value;
}

export function createDynamoDBConnection(): DynamoDBConnection {
    const configuration: DynamoDBClientConfig = {
        region: requireEnvironmentVariable(
            "AWS_DYNAMODB_REGION"
        ),
    };

    const serviceClient = new DynamoDBClient(configuration);

    const documentClient =
        DynamoDBDocumentClient.from(serviceClient, {
            marshallOptions: {
                removeUndefinedValues: true,
            },
        });

    return {
        tableName: requireEnvironmentVariable(
            "DYNAMODB_TABLE_NAME"
        ),
        documentClient,

        close() {
            serviceClient.destroy();
        },
    };
}
