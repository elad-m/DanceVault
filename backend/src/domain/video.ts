export type VideoStatus =
    | "pending_upload"
    | "ready"
    | "upload_failed"
    | "deleting";

export type VideoStorageProviderName = "minio" | "awsS3";

export type SupportedVideoContentType = "video/mp4";
export const maxVideoUploadSizeBytes: number = 500_000_000;

export const supportedVideoContentTypeSchema = {
    type: "string",
    enum: ["video/mp4"],
} as const;

type CreateVideoStorageKeyInput = {
    userId: string;
    uploadId: string;
};

export function createVideoStorageKey({
    userId,
    uploadId,
}: CreateVideoStorageKeyInput): string {
    const safeUserId = encodeURIComponent(userId);

    return `users/${safeUserId}/videos/${uploadId}.mp4`;
}
