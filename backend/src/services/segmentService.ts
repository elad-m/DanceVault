import {
    createSegmentThumbnailStorageKey,
    type Confidence,
    type Difficulty,
    type PracticePriority,
    maxSegmentThumbnailSizeBytes,
} from "../domain/segment";
import { randomUUID } from "node:crypto";
import type { SegmentDataAccess } from "../persistence/segmentDataAccess";
import {
    videoUrlExpirationSeconds,
    type VideoStorageProvider,
} from "../storage";

type UserScope = {
    userId: string;
};

type VideoScope = UserScope & {
    videoId: string;
};

type SegmentThumbnailStorageInput = UserScope & {
    segmentId: string;
    segmentDataAccess: SegmentDataAccess;
    videoStorageProvider: VideoStorageProvider;
};

export type InitializeSegmentThumbnailUploadResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "upload_ready";
        uploadUrl: string;
        expiresInSeconds: number;
    };

export type CompleteSegmentThumbnailUploadResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "upload_object_missing";
    }
    | {
        kind: "upload_too_large";
    }
    | {
        kind: "ready";
    };

export type GetSegmentThumbnailPlaybackUrlResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "thumbnail_missing";
    }
    | {
        kind: "ready";
        playbackUrl: string;
        expiresInSeconds: number;
    };

export type DeleteSegmentWithThumbnailResult =
    | {
        kind: "not_found";
    }
    | {
        kind: "deleted";
    };

export function areSegmentTimestampsValid(
    startMilliseconds: number,
    endMilliseconds: number
) {
    return endMilliseconds > startMilliseconds;
}

export async function initializeSegmentThumbnailUpload(
    input: SegmentThumbnailStorageInput
): Promise<InitializeSegmentThumbnailUploadResult> {
    const segment =
        await input.segmentDataAccess.getSegmentByID({
            userID: input.userId,
            segmentID: input.segmentId,
        });

    if (!segment) {
        return {
            kind: "not_found",
        };
    }

    const storageKey = createSegmentThumbnailStorageKey({
        userId: input.userId,
        segmentId: segment.id,
    });

    const uploadUrl =
        await input.videoStorageProvider
            .createSegmentThumbnailUploadUrl(storageKey);

    return {
        kind: "upload_ready",
        uploadUrl,
        expiresInSeconds: videoUrlExpirationSeconds,
    };
}

export async function completeSegmentThumbnailUpload(
    input: SegmentThumbnailStorageInput
): Promise<CompleteSegmentThumbnailUploadResult> {
    const segment =
        await input.segmentDataAccess.getSegmentByID({
            userID: input.userId,
            segmentID: input.segmentId,
        });

    if (!segment) {
        return {
            kind: "not_found",
        };
    }

    const storageKey = createSegmentThumbnailStorageKey({
        userId: input.userId,
        segmentId: segment.id,
    });

    const objectSizeBytes =
        await input.videoStorageProvider
            .getSegmentThumbnailObjectSizeBytes(storageKey);

    if (objectSizeBytes === null) {
        return {
            kind: "upload_object_missing",
        };
    }

    if (objectSizeBytes > maxSegmentThumbnailSizeBytes) {
        await input.videoStorageProvider
            .deleteSegmentThumbnailObject(storageKey);

        return {
            kind: "upload_too_large",
        };
    }

    return {
        kind: "ready",
    };
}

export async function getSegmentThumbnailPlaybackUrl(
    input: SegmentThumbnailStorageInput
): Promise<GetSegmentThumbnailPlaybackUrlResult> {
    const segment =
        await input.segmentDataAccess.getSegmentByID({
            userID: input.userId,
            segmentID: input.segmentId,
        });

    if (!segment) {
        return {
            kind: "not_found",
        };
    }

    const storageKey = createSegmentThumbnailStorageKey({
        userId: input.userId,
        segmentId: segment.id,
    });

    const objectSizeBytes =
        await input.videoStorageProvider
            .getSegmentThumbnailObjectSizeBytes(storageKey);

    if (objectSizeBytes === null) {
        return {
            kind: "thumbnail_missing",
        };
    }

    const playbackUrl =
        await input.videoStorageProvider
            .createSegmentThumbnailPlaybackUrl(storageKey);

    return {
        kind: "ready",
        playbackUrl,
        expiresInSeconds: videoUrlExpirationSeconds,
    };
}

export async function deleteSegmentWithThumbnail(
    input: SegmentThumbnailStorageInput
): Promise<DeleteSegmentWithThumbnailResult> {
    const segment =
        await input.segmentDataAccess.getSegmentByID({
            userID: input.userId,
            segmentID: input.segmentId,
        });

    if (!segment) {
        return {
            kind: "not_found",
        };
    }

    const storageKey = createSegmentThumbnailStorageKey({
        userId: input.userId,
        segmentId: segment.id,
    });

    await input.videoStorageProvider
        .deleteSegmentThumbnailObject(storageKey);

    await input.segmentDataAccess.deleteSegment({
        userID: input.userId,
        videoID: segment.videoId,
        segmentID: segment.id,
    });

    return {
        kind: "deleted",
    };
}

export function paginateResults<T extends { id: string }>(
    results: T[],
    limit: number,
    cursor?: string
) {
    let startIndex = 0;

    if (cursor) {
        const cursorIndex = results.findIndex(
            (result) => result.id === cursor
        );

        if (cursorIndex === -1) {
            throw new Error("Invalid segment cursor");
        }

        startIndex = cursorIndex + 1;
    }

    const pageCandidates = results.slice(
        startIndex,
        startIndex + limit + 1
    );
    const items = pageCandidates.slice(0, limit);
    const hasNextPage = pageCandidates.length > limit;
    const nextCursor = hasNextPage
        ? items[items.length - 1]?.id ?? null
        : null;

    return {
        items,
        nextCursor,
    };
}

// CRUD Operations

type CreateSegmentInput = VideoScope & {
    name: string;
    description?: string;
    startMilliseconds: number;
    endMilliseconds: number;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
    segmentDataAccess: SegmentDataAccess;
};

export async function createSegment(input: CreateSegmentInput) {
    return input.segmentDataAccess.createSegment({
        segmentID: randomUUID(),
        videoID: input.videoId,
        userID: input.userId,
        name: input.name,
        description: input.description ?? null,
        startMilliseconds: input.startMilliseconds,
        endMilliseconds: input.endMilliseconds,
        tags: input.tags ?? [],
        difficulty: input.difficulty ?? "medium",
        confidence: input.confidence ?? "medium",
        practicePriority: input.practicePriority ?? "medium",
        createdAt: new Date(),
    });
}

type PaginationInput = {
    limit: number;
    cursor?: string;
};

type SearchSegmentsInput = UserScope &
    PaginationInput & {
        tag?: string;
        difficulty?: Difficulty;
        confidence?: Confidence;
        practicePriority?: PracticePriority;
        text?: string;
        segmentDataAccess: SegmentDataAccess;
    };

export async function searchSegments(input: SearchSegmentsInput) {
    const allSegments =
        await input.segmentDataAccess.listSegments({
            userID: input.userId,
        });

    const normalizedText = input.text?.toLowerCase();

    const matchingSegments = allSegments
        .filter((segment) => {
            if (
                input.tag &&
                !segment.tags.includes(input.tag)
            ) {
                return false;
            }

            if (
                input.difficulty &&
                segment.difficulty !== input.difficulty
            ) {
                return false;
            }

            if (
                input.confidence &&
                segment.confidence !== input.confidence
            ) {
                return false;
            }

            if (
                input.practicePriority &&
                segment.practicePriority !==
                input.practicePriority
            ) {
                return false;
            }

            if (normalizedText) {
                const nameMatches = segment.name
                    .toLowerCase()
                    .includes(normalizedText);
                const descriptionMatches =
                    segment.description
                        ?.toLowerCase()
                        .includes(normalizedText) ??
                    false;

                if (!nameMatches && !descriptionMatches) {
                    return false;
                }
            }

            return true;
        })
        .sort(
            (first, second) =>
                first.createdAt.getTime() -
                second.createdAt.getTime() ||
                first.id.localeCompare(second.id)
        );

    return paginateResults(
        matchingSegments,
        input.limit,
        input.cursor
    );
}

export async function getPracticeQueue(
    input: UserScope &
        PaginationInput & {
            segmentDataAccess: SegmentDataAccess;
        }
) {
    const allSegments =
        await input.segmentDataAccess.listSegments({
            userID: input.userId,
        });

    const priorityRank: Record<PracticePriority, number> = {
        low: 1,
        medium: 2,
        high: 3,
    };
    const confidenceRank: Record<Confidence, number> = {
        low: 1,
        medium: 2,
        high: 3,
    };

    const queueSegments = allSegments
        .filter(
            (segment) =>
                segment.practicePriority === "high" ||
                segment.confidence === "low"
        )
        .sort(
            (first, second) =>
                priorityRank[second.practicePriority] -
                priorityRank[first.practicePriority] ||
                confidenceRank[first.confidence] -
                confidenceRank[second.confidence] ||
                first.createdAt.getTime() -
                second.createdAt.getTime() ||
                first.id.localeCompare(second.id)
        );

    return paginateResults(
        queueSegments,
        input.limit,
        input.cursor
    );
}
