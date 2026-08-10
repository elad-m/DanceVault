import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        exclude: [
            ...configDefaults.exclude,
            "src/**/*.integration.test.ts",
        ],
        fileParallelism: false,
        env: {
            APP_ENVIRONMENT: "local",
            DYNAMODB_ENDPOINT: "http://127.0.0.1:8000",
            AWS_DYNAMODB_REGION: "us-east-1",
            DYNAMODB_TABLE_NAME: "DanceVaultTestData",
            S3_ENDPOINT: "http://127.0.0.1:9000",
            S3_REGION: "us-east-1",
            S3_BUCKET: "dancevault-videos",
            S3_ACCESS_KEY: "dancevault",
            S3_SECRET_KEY: "dancevault-local-secret",
            AWS_ACCESS_KEY_ID: "tests-must-not-access-aws",
            AWS_SECRET_ACCESS_KEY:
                "tests-must-not-access-aws",
            AWS_SESSION_TOKEN: "",
            AWS_EC2_METADATA_DISABLED: "true",
        },
    },
});
