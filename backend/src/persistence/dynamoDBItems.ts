import type {
    VideoSourceType,
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
    createVideoItemKeys,
    type SegmentItemKeys,
    type VideoItemKeys,
} from "./dynamoDBKeys";

export const CURRENT_VIDEO_SCHEMA_VERSION = 1;
export const CURRENT_SEGMENT_SCHEMA_VERSION = 1;

export type VideoItem = VideoItemKeys & {
    entityType: "video";
    schemaVersion: typeof CURRENT_VIDEO_SCHEMA_VERSION;
    videoID: string;
    userID: string;
    title: string;
    sourceType: VideoSourceType;
    sourceURL: string | null;
    storageKey: string | null;
    storageProviderName: VideoStorageProviderName | null;
    originalFileName: string | null;
    status: VideoStatus;
    createdAt: string;
};

export type CreateVideoItemInput = {
    videoID: string;
    userID: string;
    title: string;
    sourceType: VideoSourceType;
    sourceURL: string | null;
    storageKey: string | null;
    storageProviderName: VideoStorageProviderName | null;
    originalFileName: string | null;
    status: VideoStatus;
    createdAt: Date;
};

export function createVideoItem(
    input: CreateVideoItemInput
): VideoItem {
    return {
        ...createVideoItemKeys({
            userID: input.userID,
            videoID: input.videoID,
            createdAt: input.createdAt,
        }),
        entityType: "video",
        schemaVersion: CURRENT_VIDEO_SCHEMA_VERSION,
        videoID: input.videoID,
        userID: input.userID,
        title: input.title,
        sourceType: input.sourceType,
        sourceURL: input.sourceURL,
        storageKey: input.storageKey,
        storageProviderName:
            input.storageProviderName,
        originalFileName: input.originalFileName,
        status: input.status,
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
    videoSourceType: VideoSourceType;
    videoSourceURL: string | null;
    createdAt: string;
};

type CreateSegmentItemInput = {
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
    videoSourceType: VideoSourceType;
    videoSourceURL: string | null;
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
        videoSourceType: input.videoSourceType,
        videoSourceURL: input.videoSourceURL,
        createdAt: input.createdAt.toISOString(),
    };
}
