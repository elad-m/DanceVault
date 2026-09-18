import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { VideoStorageProviderName } from "../domain/video";
import {
    createVideoStorageClientConfiguration,
    getVideoStorageBucketName,
} from "./videoStorageConfig";
import { videoUrlExpirationSeconds } from "./videoStorageProvider";

export type SegmentExportStorageProvider = {
    downloadSourceVideoToFile(
        storageKey: string,
        destinationPath: string
    ): Promise<void>;
    uploadSegmentExportFromFile(
        storageKey: string,
        sourcePath: string
    ): Promise<void>;
    createSegmentExportDownloadUrl(storageKey: string): Promise<string>;
    deleteSegmentExportObject(storageKey: string): Promise<void>;
    close(): void;
};

export function createSegmentExportStorageProvider(
    providerName: VideoStorageProviderName
): SegmentExportStorageProvider {
    const client = new S3Client(
        createVideoStorageClientConfiguration(providerName)
    );
    const bucketName = getVideoStorageBucketName(providerName);

    return {
        async downloadSourceVideoToFile(storageKey, destinationPath) {
            const response = await client.send(
                new GetObjectCommand({
                    Bucket: bucketName,
                    Key: storageKey,
                })
            );

            if (!response.Body) {
                throw new Error("Source video storage returned an empty body");
            }

            await pipeline(
                response.Body as NodeJS.ReadableStream,
                createWriteStream(destinationPath)
            );
        },

        async uploadSegmentExportFromFile(storageKey, sourcePath) {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: storageKey,
                    Body: createReadStream(sourcePath),
                    ContentType: "video/mp4",
                    Tagging: "dancevault-object=segment-export",
                })
            );
        },

        async createSegmentExportDownloadUrl(storageKey) {
            return getSignedUrl(
                client,
                new GetObjectCommand({
                    Bucket: bucketName,
                    Key: storageKey,
                    ResponseContentType: "video/mp4",
                    ResponseContentDisposition:
                        'attachment; filename="dance-segment.mp4"',
                }),
                { expiresIn: videoUrlExpirationSeconds }
            );
        },

        async deleteSegmentExportObject(storageKey) {
            await client.send(
                new DeleteObjectCommand({
                    Bucket: bucketName,
                    Key: storageKey,
                })
            );
        },

        close() {
            client.destroy();
        },
    };
}
