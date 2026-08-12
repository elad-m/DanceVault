export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

export type Confidence = "low" | "medium" | "high";

export type PracticePriority = "low" | "medium" | "high";

export const difficultySchema = {
    type: "string",
    enum: ["easy", "medium", "hard", "very_hard"],
} as const;

export const confidenceSchema = {
    type: "string",
    enum: ["low", "medium", "high"],
} as const;

export const practicePrioritySchema = {
    type: "string",
    enum: ["low", "medium", "high"],
} as const;

export const segmentThumbnailContentType = "image/jpeg" as const;

export const maxSegmentThumbnailSizeBytes = 250_000;

type CreateSegmentThumbnailStorageKeyInput = {
    userId: string;
    segmentId: string;
};

export function createSegmentThumbnailStorageKey({
    userId,
    segmentId,
}: CreateSegmentThumbnailStorageKeyInput): string {
    const safeUserId = encodeURIComponent(userId); // even though we don't expect slashes in user IDs, we encode them to be safe

    return `users/${safeUserId}/thumbnails/${segmentId}.jpg`;
}