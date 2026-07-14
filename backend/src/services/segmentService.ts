import { buildSegmentPlaybackUrl } from "../domain/segment";
import { prisma } from "../db";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
} from "../domain/segment";
import { runtime } from "../runtime";

// Helpers

type SegmentWithPlaybackSource = {
    startMilliseconds: number;
    video: {
        sourceType: string;
        sourceUrl: string | null;
    };
};

type UserScope = {
    userId: string;
};

type VideoScope = UserScope & {
    videoId: string;
};

type SegmentScope = UserScope & {
    segmentId: string;
};

export function toSegmentResponse<T extends SegmentWithPlaybackSource>(
    segment: T
) {
    const { video, ...segmentData } = segment;

    return {
        ...segmentData,
        playbackUrl: buildSegmentPlaybackUrl(video, segment.startMilliseconds),
    };
}

export function areSegmentTimestampsValid(
    startMilliseconds: number,
    endMilliseconds: number
) {
    return endMilliseconds > startMilliseconds;
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

export async function findVideoForSegmentCreation({
    videoId,
    userId,
}: VideoScope) {
    return prisma.video.findFirst({
        where: {
            id: videoId,
            userId,
            environment: runtime.environment,
        },
    });
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
};

export async function createSegment(input: CreateSegmentInput) {
    return prisma.segment.create({
        data: {
            video: {
                connect: {
                    id: input.videoId,
                    userId: input.userId,
                    environment: runtime.environment,
                },
            },
            name: input.name,
            description: input.description,
            startMilliseconds: input.startMilliseconds,
            endMilliseconds: input.endMilliseconds,
            tags: input.tags ?? [],
            difficulty: input.difficulty ?? "medium",
            confidence: input.confidence ?? "medium",
            practicePriority: input.practicePriority ?? "medium",
        },
    });
}

export async function getSegmentById({
    segmentId,
    userId,
}: SegmentScope) {
    return prisma.segment.findFirst({
        where: {
            id: segmentId,
            video: {
                userId,
                environment: runtime.environment,
            },
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
    };

export async function searchSegments(input: SearchSegmentsInput) {
    const results = await prisma.segment.findMany({
        where: {
            video: {
                userId: input.userId,
                environment: runtime.environment,
            },
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

export async function getPracticeQueue(input: UserScope & PaginationInput) {
    const results = await prisma.segment.findMany({
        where: {
            video: {
                userId: input.userId,
                environment: runtime.environment,
            },
            OR: [
                {
                    practicePriority: "high",
                },
                {
                    confidence: "low",
                },
            ],
        },
        orderBy: [
            {
                practicePriority: "desc",
            },
            {
                confidence: "asc",
            },
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

type UpdateSegmentInput = SegmentScope & {
    name?: string;
    description?: string;
    startMilliseconds?: number;
    endMilliseconds?: number;
    tags?: string[];
    difficulty?: Difficulty;
    confidence?: Confidence;
    practicePriority?: PracticePriority;
};

export async function updateSegment(input: UpdateSegmentInput) {
    const { segmentId, userId, ...data } = input;

    return prisma.segment.update({
        where: {
            id: segmentId,
            video: {
                userId,
                environment: runtime.environment,
            },
        },
        data,
    });
}

export async function findSegmentForDeletion({
    segmentId,
    userId,
}: SegmentScope) {
    return prisma.segment.findFirst({
        where: {
            id: segmentId,
            video: {
                userId,
                environment: runtime.environment,
            },
        },
    });
}

export async function deleteSegment({
    segmentId,
    userId,
}: SegmentScope) {
    return prisma.segment.delete({
        where: {
            id: segmentId,
            video: {
                userId,
                environment: runtime.environment,
            },
        },
    });
}
