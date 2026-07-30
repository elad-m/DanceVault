import type {
    APIGatewayProxyEventV2,
    Context,
} from "aws-lambda";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { createLambdaHandler } from "./lambdaHandler";

const app = Fastify();

app.get("/health", async () => {
    return { status: "ok" };
});

const handler = createLambdaHandler(app);

const event: APIGatewayProxyEventV2 = {
    version: "2.0",
    routeKey: "GET /health",
    rawPath: "/health",
    rawQueryString: "",
    headers: {
        host: "dancevault.test",
    },
    requestContext: {
        accountId: "test-account",
        apiId: "test-api",
        domainName: "dancevault.test",
        domainPrefix: "dancevault",
        http: {
            method: "GET",
            path: "/health",
            protocol: "HTTP/1.1",
            sourceIp: "127.0.0.1",
            userAgent: "vitest",
        },
        requestId: "test-request",
        routeKey: "GET /health",
        stage: "$default",
        time: "30/Jul/2026:10:00:00 +0000",
        timeEpoch: 1785405600000,
    },
    isBase64Encoded: false,
};

const context: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: "DanceVaultBackend",
    functionVersion: "$LATEST",
    invokedFunctionArn:
        "arn:aws:lambda:il-central-1:123456789012:function:DanceVaultBackend",
    memoryLimitInMB: "256",
    awsRequestId: "test-request",
    logGroupName: "/aws/lambda/DanceVaultBackend",
    logStreamName: "test-stream",
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
};

afterAll(async () => {
    await app.close();
});

describe("Lambda handler adapter", () => {
    it("translates an API Gateway request into a Fastify response", async () => {
        const response = await handler(event, context);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            status: "ok",
        });
    });
});