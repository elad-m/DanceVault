export type VideoStatus = "pending_upload" | "ready" | "upload_failed";

export type Video = {
    id: string;
    userId: string;
    title: string;
    storageKey: string;
    originalFileName: string;
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
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};
