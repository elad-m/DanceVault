export type VideoStatus = "pending_upload" | "ready" | "upload_failed";
export type VideoSourceType = "youtube" | "external_url" | "uploaded";

export type Video = {
    id: string;
    userId: string;
    title: string;
    sourceType: VideoSourceType;
    sourceUrl: string | null;
    storageKey: string | null;
    originalFileName: string | null;
    status: VideoStatus;
    createdAt: string;
};

export type Difficulty = "easy" | "medium" | "hard" | "very_hard";
export type Confidence = "low" | "medium" | "high";
export type PracticePriority = "low" | "medium" | "high";

export type Segment = {
    id: string;
    videoId: string;
    name: string;
    description: string | null;
    startMilliseconds: number;
    endMilliseconds: number;
    tags: string[];
    difficulty: Difficulty;
    confidence: Confidence;
    practicePriority: PracticePriority;
    playbackUrl: string | null;
    createdAt: string;
};

export type CreateSegmentInput = {
    name: string;
    description?: string;
    startMilliseconds: number;
    endMilliseconds: number;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};

export type UpdateSegmentInput = {
    name?: string;
    description?: string;
    startMilliseconds?: number;
    endMilliseconds?: number;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};
