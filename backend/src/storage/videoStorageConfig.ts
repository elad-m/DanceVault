import "dotenv/config";
import { networkInterfaces } from "node:os";
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

function getPrivateIPv4AddressPriority(address: string): number | null {
    const octets = address.split(".").map(Number);

    if (octets.length !== 4 || octets.some(Number.isNaN)) {
        return null;
    }

    if (octets[0] === 192 && octets[1] === 168) {
        return 0;
    }

    if (octets[0] === 10) {
        return 1;
    }

    if (
        octets[0] === 172 &&
        octets[1] >= 16 &&
        octets[1] <= 31
    ) {
        return 2;
    }

    return null;
}

export function selectLocalNetworkIPv4Address(
    addresses: string[]
): string {
    const candidates = addresses
        .map((address) => ({
            address,
            priority: getPrivateIPv4AddressPriority(address),
        }))
        .filter(
            (
                candidate
            ): candidate is { address: string; priority: number } =>
                candidate.priority !== null
        )
        .sort((first, second) => first.priority - second.priority);

    const selectedAddress = candidates[0]?.address;

    if (!selectedAddress) {
        throw new Error(
            "Could not detect a private IPv4 address; configure S3_ENDPOINT explicitly"
        );
    }

    return selectedAddress;
}

export function getMinioVideoStorageEndpoint(): string {
    const configuredEndpoint = process.env.S3_ENDPOINT?.trim();

    if (configuredEndpoint) {
        return configuredEndpoint;
    }

    const addresses = Object.values(networkInterfaces())
        .flatMap((networkInterface) => networkInterface ?? [])
        .filter(
            (address) =>
                address.family === "IPv4" && !address.internal
        )
        .map((address) => address.address);
    const localNetworkAddress =
        selectLocalNetworkIPv4Address(addresses);

    return `http://${localNetworkAddress}:9000`;
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
    const endpoint = getMinioVideoStorageEndpoint();

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
