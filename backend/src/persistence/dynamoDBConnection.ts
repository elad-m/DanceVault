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

export function createDynamoDBClientConfiguration(): DynamoDBClientConfig {
    const region = requireEnvironmentVariable(
        "AWS_DYNAMODB_REGION"
    );
    const localEndpoint = process.env.DYNAMODB_ENDPOINT;

    if (localEndpoint) {
        return {
            region,
            endpoint: localEndpoint,
            credentials: {
                accessKeyId: "local",
                secretAccessKey: "local",
            },
        };
    }

    // AWS connection: the SDK derives the official DynamoDB endpoint
    // from the region and loads credentials from its default provider chain.
    return {
        region,
    };
}

export function createDynamoDBConnection(): DynamoDBConnection {
    const serviceClient = new DynamoDBClient(
        createDynamoDBClientConfiguration()
    );

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
