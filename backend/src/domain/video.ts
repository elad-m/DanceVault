export type ExternalVideoSourceType =
    | "youtube"
    | "external_url";

export type VideoSourceType =
    | ExternalVideoSourceType
    | "uploaded";

export const externalVideoSourceTypeSchema = {
    type: "string",
    enum: ["youtube", "external_url"],
} as const;

export type SupportedVideoContentType = "video/mp4";

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
