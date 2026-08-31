import type {
    VideoStatus,
    VideoStorageProviderName,
} from "../domain/video";
import type { VideoDeletionSourceStatus } from "../domain/userQuota";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";
import {
    createSegmentItemKeys,
    createDynamoDBVideoItemKeys,
    createUserQuotaUsagePrimaryKey,
    type SegmentItemKeys,
    type DynamoDBVideoItemKeys,
    type UserQuotaUsagePrimaryKey,
} from "./dynamoDBKeys";

export const CURRENT_VIDEO_SCHEMA_VERSION = 3;
export const CURRENT_SEGMENT_SCHEMA_VERSION = 2;
export const CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION = 1;

export type DynamoDBUserQuotaUsageItem =
    UserQuotaUsagePrimaryKey & {
        entityType: "userQuotaUsage";
        schemaVersion: typeof CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION;
        userID: string;
        storedVideoBytes: number;
        pendingVideoBytes: number;
        videoCount: number;
        segmentCount: number;
        pendingVideoUploadCount: number;
    };

export type CreateDynamoDBUserQuotaUsageItemInput = {
    userID: string;
    storedVideoBytes: number;
    pendingVideoBytes: number;
    videoCount: number;
    segmentCount: number;
    pendingVideoUploadCount: number;
};

export function createDynamoDBUserQuotaUsageItem(
    input: CreateDynamoDBUserQuotaUsageItemInput
): DynamoDBUserQuotaUsageItem {
    return {
        ...createUserQuotaUsagePrimaryKey(input.userID),
        entityType: "userQuotaUsage",
        schemaVersion:
            CURRENT_USER_QUOTA_USAGE_SCHEMA_VERSION,
        userID: input.userID,
        storedVideoBytes: input.storedVideoBytes,
        pendingVideoBytes: input.pendingVideoBytes,
        videoCount: input.videoCount,
        segmentCount: input.segmentCount,
        pendingVideoUploadCount:
            input.pendingVideoUploadCount,
    };
}

export type DynamoDBVideoItem = DynamoDBVideoItemKeys & {
    entityType: "video";
    schemaVersion: typeof CURRENT_VIDEO_SCHEMA_VERSION;
    videoID: string;
    userID: string;
    title: string;
    storageKey: string;
    storageProviderName: VideoStorageProviderName;
    originalFileName: string;
    // Optional until existing schema-version-3 records are backfilled.
    fileSizeBytes?: number;
    status: VideoStatus;
    deletionSourceStatus?: VideoDeletionSourceStatus;
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
    // Omit only when constructing a legacy record for migration or testing.
    fileSizeBytes?: number;
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
        ...(input.fileSizeBytes === undefined
            ? {}
            : { fileSizeBytes: input.fileSizeBytes }),
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
