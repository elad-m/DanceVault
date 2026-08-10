import "dotenv/config";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import type { VideoStorageProviderName } from "../domain/video";
import { runtime } from "../runtime";
import {
    assertLocalServiceEndpoint,
    isRunningUnderVitest,
} from "../testEnvironmentSafety";

export function requireEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

export function getActiveVideoStorageProviderName(): VideoStorageProviderName {
    return runtime.environment === "local" ? "minio" : "awsS3";
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
    if (isRunningUnderVitest()) {
        throw new Error(
            "Tests may not create an AWS S3 client"
        );
    }

    return {
        region: requireEnvironmentVariable("AWS_S3_REGION"),
    };
}

function createMinioVideoStorageClientConfiguration(): S3ClientConfig {
    const endpoint = requireEnvironmentVariable("S3_ENDPOINT");

    if (isRunningUnderVitest()) {
        assertLocalServiceEndpoint({
            serviceName: "Video storage",
            endpoint,
        });
    }

    return {
        region: requireEnvironmentVariable("S3_REGION"),
        endpoint,
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
