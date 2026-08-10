import { describe, expect, it } from "vitest";
import {
    assertLocalServiceEndpoint,
    assertSafeDynamoDBTestTarget,
    DYNAMODB_TEST_TABLE_NAME,
} from "./testEnvironmentSafety";

describe("test environment safety", () => {
    it.each([
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://[::1]:8000",
    ])("accepts the loopback endpoint %s", (endpoint) => {
        expect(() =>
            assertLocalServiceEndpoint({
                serviceName: "Test service",
                endpoint,
            })
        ).not.toThrow();
    });

    it("rejects a missing local endpoint", () => {
        expect(() =>
            assertLocalServiceEndpoint({
                serviceName: "Test service",
                endpoint: undefined,
            })
        ).toThrow(
            "Test service tests require an explicit local endpoint"
        );
    });

    it("rejects a non-loopback endpoint", () => {
        expect(() =>
            assertLocalServiceEndpoint({
                serviceName: "Test service",
                endpoint:
                    "https://dynamodb.il-central-1.amazonaws.com",
            })
        ).toThrow(
            "Test service tests may only use a loopback endpoint"
        );
    });

    it("accepts only the dedicated local DynamoDB test table", () => {
        expect(() =>
            assertSafeDynamoDBTestTarget({
                endpoint: "http://127.0.0.1:8000",
                tableName: DYNAMODB_TEST_TABLE_NAME,
            })
        ).not.toThrow();

        expect(() =>
            assertSafeDynamoDBTestTarget({
                endpoint: "http://127.0.0.1:8000",
                tableName: "DanceVaultDevelopmentData",
            })
        ).toThrow(
            `DynamoDB tests may only use ${DYNAMODB_TEST_TABLE_NAME}`
        );
    });
});
