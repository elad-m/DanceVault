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

export type SupportedVideoContentType =
    | "video/mp4"
    | "video/quicktime"
    | "video/webm";

export const supportedVideoContentTypeSchema = {
    type: "string",
    enum: ["video/mp4", "video/quicktime", "video/webm"],
} as const;

const fileExtensionByContentType: Record<
    SupportedVideoContentType,
    string
> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
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
    const extension = fileExtensionByContentType[contentType];

    return `users/${safeUserId}/videos/${uploadId}${extension}`;
}
