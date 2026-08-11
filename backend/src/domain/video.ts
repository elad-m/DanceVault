export type VideoStatus =
    | "pending_upload"
    | "ready"
    | "upload_failed"
    | "deleting";

export type VideoStorageProviderName = "minio" | "awsS3";

export type SupportedVideoContentType =
    | "video/mp4"
    | "video/quicktime";
export const maxVideoUploadSizeBytes: number = 500_000_000;

export const supportedVideoContentTypeSchema = {
    type: "string",
    enum: ["video/mp4", "video/quicktime"],
} as const;

const videoFileExtensionByContentType: Record<
    SupportedVideoContentType,
    string
> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
};

type CreateVideoStorageKeyInput = {
    userId: string;
    uploadId: string;
    contentType: SupportedVideoContentType;
};

export function createVideoStorageKey({
    userId,
    uploadId,
    contentType,
}: CreateVideoStorageKeyInput): string {
    const safeUserId = encodeURIComponent(userId);
    const fileExtension =
        videoFileExtensionByContentType[contentType];

    return `users/${safeUserId}/videos/${uploadId}${fileExtension}`;
}
