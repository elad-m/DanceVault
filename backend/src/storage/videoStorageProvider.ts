// "S3" here means the S3-compatible storage protocol used by both AWS S3 and MinIO,
// not specifically the AWS S3 service.
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    createVideoStorageClientConfiguration,
    getVideoStorageBucketName,
} from "./videoStorageConfig";
import type { VideoStorageProviderName } from "../domain/video";

export type VideoStorageProvider = {
    name: VideoStorageProviderName;
    bucketName: string;
    createVideoUploadUrl(input: CreateVideoUploadUrlInput): Promise<string>;
    createVideoPlaybackUrl(storageKey: string): Promise<string>;
    videoObjectExists(storageKey: string): Promise<boolean>;
    deleteVideoObject(storageKey: string): Promise<void>;
    listVideoObjectKeys(): Promise<string[]>;
    close(): void;
};

export type CreateVideoUploadUrlInput = {
    storageKey: string;
    contentType: "video/mp4";
};

export const videoUrlExpirationSeconds = 15 * 60;

// Core provider construction and S3-compatible implementation.
export function createVideoStorageProvider(
    providerName: VideoStorageProviderName
): VideoStorageProvider {
    const client = new S3Client(
        createVideoStorageClientConfiguration(providerName)
    );
    const bucketName = getVideoStorageBucketName(providerName);

    return {
        name: providerName,
        bucketName,

        async createVideoUploadUrl(
            input: CreateVideoUploadUrlInput
        ): Promise<string> {
            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: input.storageKey,
                ContentType: input.contentType,
            });

            return getSignedUrl(client, command, {
                expiresIn: videoUrlExpirationSeconds,
            });
        },

        async createVideoPlaybackUrl(
            storageKey: string
        ): Promise<string> {
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: storageKey,
            });

            return getSignedUrl(client, command, {
                expiresIn: videoUrlExpirationSeconds,
            });
        },

        async videoObjectExists(storageKey: string): Promise<boolean> {
            const command = new HeadObjectCommand({
                Bucket: bucketName,
                Key: storageKey,
            });

            try {
                await client.send(command);
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
        },

        async deleteVideoObject(storageKey: string): Promise<void> {
            const command = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: storageKey,
            });

            await client.send(command);
        },

        async listVideoObjectKeys(): Promise<string[]> {
            const storageKeys: string[] = [];
            let continuationToken: string | undefined;

            do {
                const command = new ListObjectsV2Command({
                    Bucket: bucketName,
                    ContinuationToken: continuationToken,
                });

                const response = await client.send(command);

                for (const object of response.Contents ?? []) {
                    if (object.Key) {
                        storageKeys.push(object.Key);
                    }
                }

                continuationToken = response.NextContinuationToken;
            } while (continuationToken);

            return storageKeys.sort();
        },

        close(): void {
            client.destroy();
        },
    };
}
