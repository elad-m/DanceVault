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

type SegmentPlaybackSource = {
    sourceType: string;
    sourceUrl: string | null;
};

export function buildSegmentPlaybackUrl(
    source: SegmentPlaybackSource,
    startSeconds: number
): string | null {
    if (!source.sourceUrl) {
        return null;
    }

    try {
        const url = new URL(source.sourceUrl);

        if (source.sourceType === "youtube") {
            url.searchParams.set("t", `${startSeconds}s`);
        } else {
            url.hash = `t=${startSeconds}`;
        }

        return url.toString();
    } catch {
        return source.sourceUrl;
    }
}
