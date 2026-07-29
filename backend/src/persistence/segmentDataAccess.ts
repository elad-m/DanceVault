// Defines the database-independent segment data used by application services.

import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";

export type SegmentDataAccessItem = {
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
    createdAt: Date;
};

type CreateSegmentDataAccessInput = {
    segmentID: string;
    videoID: string;
    userID: string;
    name: string;
    description: string | null;
    startMilliseconds: number;
    endMilliseconds: number;
    tags: string[];
    difficulty: Difficulty;
    confidence: Confidence;
    practicePriority: PracticePriority;
    createdAt: Date;
};

type GetSegmentByIDInput = {
    userID: string;
    segmentID: string;
};

type ListSegmentsInput = {
    userID: string;
};

type ListSegmentsByVideoInput = {
    userID: string;
    videoID: string;
};

type UpdateSegmentMetadataInput = {
    userID: string;
    segmentID: string;
    name?: string;
    description?: string | null;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};

type DeleteSegmentInput = {
    userID: string;
    videoID: string;
    segmentID: string;
};

export type SegmentDataAccess = {
    createSegment(
        input: CreateSegmentDataAccessInput
    ): Promise<SegmentDataAccessItem>;

    getSegmentByID(
        input: GetSegmentByIDInput
    ): Promise<SegmentDataAccessItem | null>;

    listSegments(
        input: ListSegmentsInput
    ): Promise<SegmentDataAccessItem[]>;

    listSegmentsByVideo(
        input: ListSegmentsByVideoInput
    ): Promise<SegmentDataAccessItem[]>;

    updateSegmentMetadata(
        input: UpdateSegmentMetadataInput
    ): Promise<SegmentDataAccessItem>;

    deleteSegment(input: DeleteSegmentInput): Promise<void>;
};