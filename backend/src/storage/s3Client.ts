import "dotenv/config";
import {
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
    type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

type StorageProvider = "aws" | "minio";

function readStorageProvider(): StorageProvider {
    const provider = requireEnvironmentVariable("S3_PROVIDER");

    if (provider !== "aws" && provider !== "minio") {
        throw new Error('S3_PROVIDER must be either "aws" or "minio"');
    }

    return provider;
}

function createS3ClientConfiguration(): S3ClientConfig {
    const provider = readStorageProvider();
    const region = requireEnvironmentVariable("S3_REGION");

    if (provider === "aws") {
        return {
            region,
        };
    }

    return {
        region,
        endpoint: requireEnvironmentVariable("S3_ENDPOINT"),
        credentials: {
            accessKeyId: requireEnvironmentVariable("S3_ACCESS_KEY"),
            secretAccessKey: requireEnvironmentVariable("S3_SECRET_KEY"),
        },
        forcePathStyle: true,
    };
}

export const videoBucketName: string =
    requireEnvironmentVariable("S3_BUCKET");

export const s3Client: S3Client = new S3Client(
    createS3ClientConfiguration()
);

export type CreateVideoUploadUrlInput = {
    storageKey: string;
    contentType: "video/mp4";
};

export type VideoStorage = {
    createVideoUploadUrl(
        input: CreateVideoUploadUrlInput
    ): Promise<string>;
    createVideoPlaybackUrl(storageKey: string): Promise<string>;
    videoObjectExists(storageKey: string): Promise<boolean>;
};

export const videoUrlExpirationSeconds = 15 * 60;

export async function createVideoUploadUrl({
    storageKey,
    contentType,
}: CreateVideoUploadUrlInput): Promise<string> {
    const uploadCommand = new PutObjectCommand({
        Bucket: videoBucketName,
        Key: storageKey,
        ContentType: contentType,
    });

    return getSignedUrl(s3Client, uploadCommand, {
        expiresIn: videoUrlExpirationSeconds,
    });
}

export async function createVideoPlaybackUrl(
    storageKey: string
): Promise<string> {
    const playbackCommand = new GetObjectCommand({
        Bucket: videoBucketName,
        Key: storageKey,
    });

    return getSignedUrl(s3Client, playbackCommand, {
        expiresIn: videoUrlExpirationSeconds,
    });
}

export async function videoObjectExists(
    storageKey: string
): Promise<boolean> {
    const command = new HeadObjectCommand({
        Bucket: videoBucketName,
        Key: storageKey,
    });

    try {
        await s3Client.send(command);
        return true;
    } catch (error: unknown) {
        if (
            error instanceof S3ServiceException &&
            error.$metadata.httpStatusCode === 404
        ) {
            return false;
        }

        throw error;
    }
}

export const s3VideoStorage: VideoStorage = {
    createVideoPlaybackUrl,
    createVideoUploadUrl,
    videoObjectExists,
};
