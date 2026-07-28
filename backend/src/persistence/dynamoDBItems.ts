import type {
    VideoStatus,
    VideoStorageProviderName,
} from "../domain/video";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";
import {
    createSegmentItemKeys,
    createDynamoDBVideoItemKeys,
    type SegmentItemKeys,
    type DynamoDBVideoItemKeys,
} from "./dynamoDBKeys";

export const CURRENT_VIDEO_SCHEMA_VERSION = 3;
export const CURRENT_SEGMENT_SCHEMA_VERSION = 2;

export type DynamoDBVideoItem = DynamoDBVideoItemKeys & {
    entityType: "video";
    schemaVersion: typeof CURRENT_VIDEO_SCHEMA_VERSION;
    videoID: string;
    userID: string;
    title: string;
    storageKey: string;
    storageProviderName: VideoStorageProviderName;
    originalFileName: string;
    status: VideoStatus;
    segmentCount: number;
    createdAt: string;
};

export type CreateDynamoDBVideoItemInput = {
    videoID: string;
    userID: string;
    title: string;
    storageKey: string;
    storageProviderName: VideoStorageProviderName;
    originalFileName: string;
    status: VideoStatus;
    createdAt: Date;
};

export function createDynamoDBVideoItem(
    input: CreateDynamoDBVideoItemInput
): DynamoDBVideoItem {
    return {
        ...createDynamoDBVideoItemKeys({
            userID: input.userID,
            videoID: input.videoID,
            createdAt: input.createdAt,
        }),
        entityType: "video",
        schemaVersion: CURRENT_VIDEO_SCHEMA_VERSION,
        videoID: input.videoID,
        userID: input.userID,
        title: input.title,
        storageKey: input.storageKey,
        storageProviderName:
            input.storageProviderName,
        originalFileName: input.originalFileName,
        status: input.status,
        segmentCount: 0,
        createdAt: input.createdAt.toISOString(),
    };
}

export type SegmentItem = SegmentItemKeys & {
    entityType: "segment";
    schemaVersion: typeof CURRENT_SEGMENT_SCHEMA_VERSION;
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
    createdAt: string;
};

export type CreateSegmentItemInput = {
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

export function createSegmentItem(
    input: CreateSegmentItemInput
): SegmentItem {
    return {
        ...createSegmentItemKeys({
            userID: input.userID,
            videoID: input.videoID,
            segmentID: input.segmentID,
            startMilliseconds:
                input.startMilliseconds,
            createdAt: input.createdAt,
        }),
        entityType: "segment",
        schemaVersion: CURRENT_SEGMENT_SCHEMA_VERSION,
        segmentID: input.segmentID,
        videoID: input.videoID,
        userID: input.userID,
        name: input.name,
        description: input.description,
        startMilliseconds: input.startMilliseconds,
        endMilliseconds: input.endMilliseconds,
        tags: input.tags,
        difficulty: input.difficulty,
        confidence: input.confidence,
        practicePriority: input.practicePriority,
        createdAt: input.createdAt.toISOString(),
    };
}
