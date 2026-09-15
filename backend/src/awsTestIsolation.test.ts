import { afterEach, describe, expect, it, vi } from "vitest";
import { createCognitoAccessTokenVerifier } from "./auth/cognitoAuth";
import { createLiveCognitoUserIdentityProvider } from "./auth/cognitoUserIdentityProvider";
import { createSQSVideoDeletionQueue } from "./jobs/sqsVideoDeletionQueue";
import { createSQSAccountDeletionQueue } from "./jobs/sqsAccountDeletionQueue";
import {
    createDynamoDBClientConfiguration,
    createDynamoDBConnection,
} from "./persistence/dynamoDBConnection";
import { createVideoStorageClientConfiguration } from "./storage/videoStorageConfig";
import {
    clearDynamoDBTestDatabase,
    getDynamoDBTestUserQuotaUsage,
} from "./test/dynamoDBTestDatabase";

describe("AWS test isolation", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("forces local resources and invalid AWS credentials", () => {
        expect(process.env.APP_ENVIRONMENT).toBe("local");
        expect(process.env.DYNAMODB_ENDPOINT).toBe(
            "http://127.0.0.1:8000"
        );
        expect(process.env.DYNAMODB_TABLE_NAME).toBe(
            "DanceVaultTestData"
        );
        expect(process.env.S3_ENDPOINT).toBe(
            "http://127.0.0.1:9000"
        );
        expect(process.env.AWS_ACCESS_KEY_ID).toBe(
            "tests-must-not-access-aws"
        );
    });

    it("rejects the development DynamoDB table even with a local endpoint", () => {
        vi.stubEnv("DYNAMODB_ENDPOINT", "http://127.0.0.1:8000");
        vi.stubEnv(
            "DYNAMODB_TABLE_NAME",
            "DanceVaultDevelopmentData"
        );

        expect(() => createDynamoDBClientConfiguration()).toThrow(
            "DynamoDB tests may only use DanceVaultTestData"
        );
    });

    it("refuses to clear the development DynamoDB table", async () => {
        vi.stubEnv("DYNAMODB_ENDPOINT", "http://127.0.0.1:8000");
        vi.stubEnv(
            "DYNAMODB_TABLE_NAME",
            "DanceVaultDevelopmentData"
        );

        await expect(clearDynamoDBTestDatabase()).rejects.toThrow(
            "DynamoDB tests may only use DanceVaultTestData"
        );
    });

    it("refuses to read quota usage from the development DynamoDB table", async () => {
        vi.stubEnv("DYNAMODB_ENDPOINT", "http://127.0.0.1:8000");
        vi.stubEnv(
            "DYNAMODB_TABLE_NAME",
            "DanceVaultDevelopmentData"
        );

        await expect(
            getDynamoDBTestUserQuotaUsage("test-user")
        ).rejects.toThrow(
            "DynamoDB tests may only use DanceVaultTestData"
        );
    });

    it("rejects DynamoDB without a loopback endpoint", () => {
        vi.stubEnv("DYNAMODB_ENDPOINT", "");
        vi.stubEnv("DYNAMODB_TABLE_NAME", "DanceVaultTestData");

        expect(() => createDynamoDBConnection()).toThrow(
            "DynamoDB tests require an explicit local endpoint"
        );
    });

    it("rejects AWS S3 regardless of configured credentials", () => {
        vi.stubEnv("AWS_S3_REGION", "il-central-1");

        expect(() =>
            createVideoStorageClientConfiguration("awsS3")
        ).toThrow("Tests may not create an AWS S3 client");
    });

    it("rejects a non-loopback MinIO endpoint", () => {
        vi.stubEnv("S3_ENDPOINT", "https://storage.example.com");

        expect(() =>
            createVideoStorageClientConfiguration("minio")
        ).toThrow(
            "Video storage tests may only use a loopback endpoint"
        );
    });

    it("requires tests to inject an SQS queue fake", () => {
        expect(() => createSQSVideoDeletionQueue()).toThrow(
            "Tests must inject a fake video deletion queue"
        );
        expect(() => createSQSAccountDeletionQueue()).toThrow(
            "Tests must inject a fake account deletion queue"
        );
    });

    it("requires tests to inject a Cognito verifier fake", () => {
        expect(() => createCognitoAccessTokenVerifier()).toThrow(
            "Tests must inject a fake Cognito access token verifier"
        );
        expect(() => createLiveCognitoUserIdentityProvider()).toThrow(
            "Tests must inject a fake Cognito user identity provider"
        );
    });
});
