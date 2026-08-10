const loopbackHostnames = new Set([
    "127.0.0.1",
    "localhost",
    "[::1]",
]);

export const DYNAMODB_TEST_TABLE_NAME =
    "DanceVaultTestData";

export function isRunningUnderVitest(): boolean {
    return process.env.VITEST === "true";
}

type AssertLocalServiceEndpointInput = {
    serviceName: string;
    endpoint: string | undefined;
};

export function assertLocalServiceEndpoint({
    serviceName,
    endpoint,
}: AssertLocalServiceEndpointInput): void {
    if (!endpoint) {
        throw new Error(
            `${serviceName} tests require an explicit local endpoint`
        );
    }

    let hostname: string;

    try {
        hostname = new URL(endpoint).hostname;
    } catch {
        throw new Error(
            `${serviceName} test endpoint must be a valid URL`
        );
    }

    if (!loopbackHostnames.has(hostname)) {
        throw new Error(
            `${serviceName} tests may only use a loopback endpoint`
        );
    }
}

type AssertSafeDynamoDBTestTargetInput = {
    endpoint: string | undefined;
    tableName: string | undefined;
};

export function assertSafeDynamoDBTestTarget({
    endpoint,
    tableName,
}: AssertSafeDynamoDBTestTargetInput): void {
    assertLocalServiceEndpoint({
        serviceName: "DynamoDB",
        endpoint,
    });

    if (tableName !== DYNAMODB_TEST_TABLE_NAME) {
        throw new Error(
            `DynamoDB tests may only use ${DYNAMODB_TEST_TABLE_NAME}`
        );
    }
}
