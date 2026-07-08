import "dotenv/config";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
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

export type StorageProvider = "aws" | "minio";

export function readStorageProvider(): StorageProvider {
    const provider = requireEnvironmentVariable("S3_PROVIDER");

    if (provider !== "aws" && provider !== "minio") {
        throw new Error('S3_PROVIDER must be either "aws" or "minio"');
    }

    return provider;
}

function createAWSS3ClientConfiguration(): S3ClientConfig {
    return {
        region: requireEnvironmentVariable("AWS_S3_REGION"),
    };
}

function createMinIOS3ClientConfiguration(): S3ClientConfig {
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

function createS3ClientConfiguration(): S3ClientConfig {
    const provider = readStorageProvider();

    if (provider === "aws") {
        return createAWSS3ClientConfiguration();
    }

    return createMinIOS3ClientConfiguration();
}

export function createStorageClient(
    provider: StorageProvider
): S3Client {
    const configuration =
        provider === "aws"
            ? createAWSS3ClientConfiguration()
            : createMinIOS3ClientConfiguration();

    return new S3Client(configuration);
}

export type StorageTarget = {
    provider: StorageProvider;
    client: S3Client;
    bucketName: string;
};

export function createStorageTarget(
    provider: StorageProvider
): StorageTarget {
    if (provider === "aws") {
        return {
            provider,
            client: createStorageClient("aws"),
            bucketName: requireEnvironmentVariable("AWS_S3_BUCKET"),
        };
    }

    return {
        provider,
        client: createStorageClient("minio"),
        bucketName: videoBucketName,
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
    deleteVideoObject(storageKey: string): Promise<void>;
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

export async function deleteVideoObject(
    storageKey: string
): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: videoBucketName,
        Key: storageKey,
    });

    await s3Client.send(command);
}

export const defaultStorageTarget: StorageTarget = {
    provider: readStorageProvider(),
    client: s3Client,
    bucketName: videoBucketName,
};

export async function listVideoObjectKeys(
    target: StorageTarget = defaultStorageTarget
): Promise<string[]> {
    const storageKeys: string[] = [];
    let continuationToken: string | undefined;

    do {
        const command = new ListObjectsV2Command({
            Bucket: target.bucketName,
            ContinuationToken: continuationToken,
        });

        const response = await target.client.send(command);

        for (const object of response.Contents ?? []) {
            if (object.Key) {
                storageKeys.push(object.Key);
            }
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return storageKeys.sort();
}

export const s3VideoStorage: VideoStorage = {
    createVideoPlaybackUrl,
    createVideoUploadUrl,
    deleteVideoObject,
    videoObjectExists,
};
