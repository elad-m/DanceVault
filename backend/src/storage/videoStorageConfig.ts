import "dotenv/config";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import type { VideoStorageProviderName } from "../domain/video";

export function requireEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

export function getActiveVideoStorageProviderName(): VideoStorageProviderName {
    const providerName = requireEnvironmentVariable("S3_PROVIDER");

    if (providerName !== "awsS3" && providerName !== "minio") {
        throw new Error('S3_PROVIDER must be either "awsS3" or "minio"');
    }

    return providerName;
}

export function getVideoStorageBucketName(
    providerName: VideoStorageProviderName
): string {
    if (providerName === "awsS3") {
        return requireEnvironmentVariable("AWS_S3_BUCKET");
    }

    return requireEnvironmentVariable("S3_BUCKET");
}

function createAwsVideoStorageClientConfiguration(): S3ClientConfig {
    return {
        region: requireEnvironmentVariable("AWS_S3_REGION"),
    };
}

function createMinioVideoStorageClientConfiguration(): S3ClientConfig {
    return {
        region: requireEnvironmentVariable("S3_REGION"),
        endpoint: requireEnvironmentVariable("S3_ENDPOINT"),
        credentials: {
            accessKeyId: requireEnvironmentVariable("S3_ACCESS_KEY"),
            secretAccessKey: requireEnvironmentVariable("S3_SECRET_KEY"),
        },
        forcePathStyle: true,
    };
}

export function createVideoStorageClientConfiguration(
    providerName: VideoStorageProviderName
): S3ClientConfig {
    return providerName === "awsS3"
        ? createAwsVideoStorageClientConfiguration()
        : createMinioVideoStorageClientConfiguration();
}
