import { buildSegmentPlaybackUrl } from "../domain/segment";
import { prisma } from "../db";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";

// Helpers

type SegmentWithPlaybackSource = {
    startSeconds: number;
    video: {
        sourceType: string;
        sourceUrl: string;
    };
};

export function toSegmentResponse<T extends SegmentWithPlaybackSource>(
    segment: T
) {
    const { video, ...segmentData } = segment;

    return {
        ...segmentData,
        playbackUrl: buildSegmentPlaybackUrl(video, segment.startSeconds),
    };
}

export function areSegmentTimestampsValid(
    startSeconds: number,
    endSeconds: number
) {
    return endSeconds > startSeconds;
}

export function paginateResults<T extends { id: string }>(
    results: T[],
    limit: number
) {
    const items = results.slice(0, limit);
    const hasNextPage = results.length > limit;
    const nextCursor = hasNextPage
        ? items[items.length - 1]?.id ?? null
        : null;

    return {
        items,
        nextCursor,
    };
}

export async function findVideoForSegmentCreation(videoId: string) {
    return prisma.video.findUnique({
        where: {
            id: videoId,
        },
    });
}

// CRUD Operations

type CreateSegmentInput = {
    videoId: string;
    name: string;
    description?: string;
    startSeconds: number;
    endSeconds: number;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};

export async function createSegment(input: CreateSegmentInput) {
    return prisma.segment.create({
        data: {
            videoId: input.videoId,
            name: input.name,
            description: input.description,
            startSeconds: input.startSeconds,
            endSeconds: input.endSeconds,
            tags: input.tags ?? [],
            difficulty: input.difficulty ?? "medium",
            confidence: input.confidence ?? "medium",
            practicePriority: input.practicePriority ?? "medium",
        },
    });
}

export async function getSegmentById(segmentId: string) {
    return prisma.segment.findUnique({
        where: {
            id: segmentId,
        },
        include: {
            video: {
                select: {
                    sourceType: true,
                    sourceUrl: true,
                },
            },
        },
    });
}

type SearchSegmentsInput = {
    tag?: string;
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
    text?: string;
    limit: number;
    cursor?: string;
};

export async function searchSegments(input: SearchSegmentsInput) {
    const results = await prisma.segment.findMany({
        where: {
            tags: input.tag
                ? {
                      has: input.tag,
                  }
                : undefined,
            difficulty: input.difficulty,
            confidence: input.confidence,
            practicePriority: input.practicePriority,
            OR: input.text
                ? [
                      {
                          name: {
                              contains: input.text,
                              mode: "insensitive",
                          },
                      },
                      {
                          description: {
                              contains: input.text,
                              mode: "insensitive",
                          },
                      },
                  ]
                : undefined,
        },
        orderBy: [
            {
                createdAt: "asc",
            },
            {
                id: "asc",
            },
        ],
        take: input.limit + 1,
        cursor: input.cursor
            ? {
                  id: input.cursor,
              }
            : undefined,
        skip: input.cursor ? 1 : 0,
        include: {
            video: {
                select: {
                    sourceType: true,
                    sourceUrl: true,
                },
            },
        },
    });

    return paginateResults(results, input.limit);
}

export async function getPracticeQueue() {
    return prisma.segment.findMany({
        orderBy: [
            {
                practicePriority: "desc",
            },
            {
                createdAt: "asc",
            },
        ],
        include: {
            video: {
                select: {
                    sourceType: true,
                    sourceUrl: true,
                },
            },
        },
    });
}

type UpdateSegmentInput = {
    segmentId: string;
    name?: string;
    description?: string;
    startSeconds?: number;
    endSeconds?: number;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};

export async function updateSegment(input: UpdateSegmentInput) {
    const { segmentId, ...data } = input;

    return prisma.segment.update({
        where: {
            id: segmentId,
        },
        data,
    });
}

export async function findSegmentForDeletion(segmentId: string) {
    return prisma.segment.findUnique({
        where: {
            id: segmentId,
        },
    });
}

export async function deleteSegment(segmentId: string) {
    return prisma.segment.delete({
        where: {
            id: segmentId,
        },
    });
}
