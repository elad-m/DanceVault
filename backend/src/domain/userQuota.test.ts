import { describe, expect, it } from "vitest";
import {
    calculateUserQuotaUsage,
    calculateSegmentCreationQuota,
    calculateVideoDeletionQuota,
    calculateVideoUploadCompletion,
    calculateVideoUploadFailure,
    calculateVideoUploadReservation,
    reconcileUserQuotaUsage,
    type QuotaCountedVideo,
} from "./userQuota";

describe("calculateVideoUploadReservation", () => {
    const currentUsage = {
        storedVideoBytes: 1_000,
        pendingVideoBytes: 500,
        videoCount: 2,
        segmentCount: 4,
        pendingVideoUploadCount: 1,
    };

    it("reserves pending bytes and video counters", () => {
        expect(
            calculateVideoUploadReservation({
                currentUsage,
                fileSizeBytes: 250,
            })
        ).toEqual({
            ...currentUsage,
            pendingVideoBytes: 750,
            videoCount: 3,
            pendingVideoUploadCount: 2,
        });
    });

    it.each([
        {
            limitName: "video_count" as const,
            usage: {
                ...currentUsage,
                videoCount: 100,
            },
        },
        {
            limitName: "pending_video_upload_count" as const,
            usage: {
                ...currentUsage,
                pendingVideoUploadCount: 3,
            },
        },
        {
            limitName: "stored_video_bytes" as const,
            usage: {
                ...currentUsage,
                storedVideoBytes: 9_999_999_900,
            },
        },
    ])("rejects the $limitName limit", ({ limitName, usage }) => {
        expect(() =>
            calculateVideoUploadReservation({
                currentUsage: usage,
                fileSizeBytes: 250,
            })
        ).toThrow(
            expect.objectContaining({
                limitName,
            })
        );
    });
});

describe("calculateVideoUploadCompletion", () => {
    const currentUsage = {
        storedVideoBytes: 1_000,
        pendingVideoBytes: 500,
        videoCount: 3,
        segmentCount: 4,
        pendingVideoUploadCount: 2,
    };

    it("moves the reservation to storage-verified bytes", () => {
        expect(
            calculateVideoUploadCompletion({
                currentUsage,
                reservedFileSizeBytes: 250,
                actualFileSizeBytes: 275,
            })
        ).toEqual({
            ...currentUsage,
            storedVideoBytes: 1_275,
            pendingVideoBytes: 250,
            pendingVideoUploadCount: 1,
        });
    });

    it("rejects an actual size that exceeds remaining storage quota", () => {
        expect(() =>
            calculateVideoUploadCompletion({
                currentUsage: {
                    ...currentUsage,
                    storedVideoBytes: 9_999_999_700,
                },
                reservedFileSizeBytes: 250,
                actualFileSizeBytes: 400,
            })
        ).toThrow(
            expect.objectContaining({
                limitName: "stored_video_bytes",
            })
        );
    });

    it("rejects missing pending reservation counters", () => {
        expect(() =>
            calculateVideoUploadCompletion({
                currentUsage: {
                    ...currentUsage,
                    pendingVideoBytes: 100,
                },
                reservedFileSizeBytes: 250,
                actualFileSizeBytes: 250,
            })
        ).toThrow(
            "does not contain the pending upload reservation"
        );
    });
});

describe("calculateVideoUploadFailure", () => {
    const currentUsage = {
        storedVideoBytes: 1_000,
        pendingVideoBytes: 500,
        videoCount: 3,
        segmentCount: 4,
        pendingVideoUploadCount: 2,
    };

    it("releases pending bytes and count while retaining the video slot", () => {
        expect(
            calculateVideoUploadFailure({
                currentUsage,
                reservedFileSizeBytes: 250,
            })
        ).toEqual({
            ...currentUsage,
            pendingVideoBytes: 250,
            pendingVideoUploadCount: 1,
        });
    });

    it("rejects missing pending reservation counters", () => {
        expect(() =>
            calculateVideoUploadFailure({
                currentUsage: {
                    ...currentUsage,
                    pendingVideoUploadCount: 0,
                },
                reservedFileSizeBytes: 250,
            })
        ).toThrow(
            "does not contain the failed upload reservation"
        );
    });
});

describe("calculateVideoDeletionQuota", () => {
    const currentUsage = {
        storedVideoBytes: 1_000,
        pendingVideoBytes: 500,
        videoCount: 3,
        segmentCount: 4,
        pendingVideoUploadCount: 2,
    };

    it("releases a ready video's stored bytes and video slot", () => {
        expect(
            calculateVideoDeletionQuota({
                currentUsage,
                sourceStatus: "ready",
                fileSizeBytes: 400,
            })
        ).toEqual({
            ...currentUsage,
            storedVideoBytes: 600,
            videoCount: 2,
        });
    });

    it("releases a pending video's reservation and both counters", () => {
        expect(
            calculateVideoDeletionQuota({
                currentUsage,
                sourceStatus: "pending_upload",
                fileSizeBytes: 250,
            })
        ).toEqual({
            ...currentUsage,
            pendingVideoBytes: 250,
            videoCount: 2,
            pendingVideoUploadCount: 1,
        });
    });

    it("releases only the video slot for a failed upload", () => {
        expect(
            calculateVideoDeletionQuota({
                currentUsage,
                sourceStatus: "upload_failed",
                fileSizeBytes: null,
            })
        ).toEqual({
            ...currentUsage,
            videoCount: 2,
        });
    });

    it("rejects deletion when the relevant byte counter is too small", () => {
        expect(() =>
            calculateVideoDeletionQuota({
                currentUsage,
                sourceStatus: "ready",
                fileSizeBytes: 1_001,
            })
        ).toThrow(
            "does not contain the stored video bytes"
        );
    });

    it("rejects deletion when the video slot is missing", () => {
        expect(() =>
            calculateVideoDeletionQuota({
                currentUsage: {
                    ...currentUsage,
                    videoCount: 0,
                },
                sourceStatus: "upload_failed",
                fileSizeBytes: null,
            })
        ).toThrow(
            "does not contain the video being deleted"
        );
    });
});

describe("calculateSegmentCreationQuota", () => {
    const currentUsage = {
        storedVideoBytes: 1_000,
        pendingVideoBytes: 500,
        videoCount: 3,
        segmentCount: 4,
        pendingVideoUploadCount: 2,
    };

    it("increments the user and parent-video segment counters", () => {
        expect(
            calculateSegmentCreationQuota({
                currentUsage,
                currentVideoSegmentCount: 2,
            })
        ).toEqual({
            userQuotaUsage: {
                ...currentUsage,
                segmentCount: 5,
            },
            videoSegmentCount: 3,
        });
    });

    it("rejects creation at the user's segment limit", () => {
        expect(() =>
            calculateSegmentCreationQuota({
                currentUsage: {
                    ...currentUsage,
                    segmentCount: 1_000,
                },
                currentVideoSegmentCount: 2,
            })
        ).toThrowError(
            expect.objectContaining({
                name: "SegmentQuotaExceededError",
                limitName: "segment_count",
            })
        );
    });

    it("rejects creation at the video's segment limit", () => {
        expect(() =>
            calculateSegmentCreationQuota({
                currentUsage,
                currentVideoSegmentCount: 200,
            })
        ).toThrowError(
            expect.objectContaining({
                name: "SegmentQuotaExceededError",
                limitName: "segments_per_video",
            })
        );
    });
});

describe("calculateUserQuotaUsage", () => {
    it("calculates stored, pending, and record counters by video status", () => {
        const videos: QuotaCountedVideo[] = [
            {
                id: "ready-video",
                status: "ready",
                fileSizeBytes: 400_000_000,
            },
            {
                id: "deleting-video",
                status: "deleting",
                fileSizeBytes: 300_000_000,
            },
            {
                id: "pending-video",
                status: "pending_upload",
                fileSizeBytes: 100_000_000,
            },
            {
                id: "failed-video",
                status: "upload_failed",
                fileSizeBytes: 200_000_000,
            },
        ];

        expect(
            calculateUserQuotaUsage({
                videos,
                segmentCount: 12,
            })
        ).toEqual({
            storedVideoBytes: 700_000_000,
            pendingVideoBytes: 100_000_000,
            videoCount: 4,
            segmentCount: 12,
            pendingVideoUploadCount: 1,
        });
    });

    it.each(["ready", "deleting", "pending_upload"] as const)(
        "rejects a %s video without file-size metadata",
        (status) => {
            expect(() =>
                calculateUserQuotaUsage({
                    videos: [
                        {
                            id: "video-without-size",
                            status,
                            fileSizeBytes: null,
                        },
                    ],
                    segmentCount: 0,
                })
            ).toThrow(
                "Video video-without-size needs file-size metadata"
            );
        }
    );

    it("allows a failed upload without file-size metadata", () => {
        expect(
            calculateUserQuotaUsage({
                videos: [
                    {
                        id: "failed-video",
                        status: "upload_failed",
                        fileSizeBytes: null,
                    },
                ],
                segmentCount: 0,
            })
        ).toEqual({
            storedVideoBytes: 0,
            pendingVideoBytes: 0,
            videoCount: 1,
            segmentCount: 0,
            pendingVideoUploadCount: 0,
        });
    });
});

describe("reconcileUserQuotaUsage", () => {
    it("reports matches, missing counters, mismatches, and incomplete sizes", () => {
        const matchingUsage = {
            storedVideoBytes: 100,
            pendingVideoBytes: 0,
            videoCount: 1,
            segmentCount: 2,
            pendingVideoUploadCount: 0,
        };

        expect(
            reconcileUserQuotaUsage([
                {
                    userID: "healthy-user",
                    videos: [
                        {
                            id: "healthy-video",
                            status: "ready",
                            fileSizeBytes: 100,
                        },
                    ],
                    segmentCount: 2,
                    persistedUsage: matchingUsage,
                },
                {
                    userID: "missing-usage-user",
                    videos: [],
                    segmentCount: 0,
                    persistedUsage: null,
                },
                {
                    userID: "mismatched-user",
                    videos: [],
                    segmentCount: 0,
                    persistedUsage: {
                        storedVideoBytes: 1,
                        pendingVideoBytes: 0,
                        videoCount: 0,
                        segmentCount: 0,
                        pendingVideoUploadCount: 0,
                    },
                },
                {
                    userID: "missing-size-user",
                    videos: [
                        {
                            id: "video-without-size",
                            status: "ready",
                            fileSizeBytes: null,
                        },
                    ],
                    segmentCount: 0,
                    persistedUsage: null,
                },
            ])
        ).toEqual({
            healthy: [
                {
                    userID: "healthy-user",
                    usage: matchingUsage,
                },
            ],
            issues: [
                {
                    kind: "usage_mismatch",
                    userID: "mismatched-user",
                    expectedUsage: {
                        storedVideoBytes: 0,
                        pendingVideoBytes: 0,
                        videoCount: 0,
                        segmentCount: 0,
                        pendingVideoUploadCount: 0,
                    },
                    persistedUsage: {
                        storedVideoBytes: 1,
                        pendingVideoBytes: 0,
                        videoCount: 0,
                        segmentCount: 0,
                        pendingVideoUploadCount: 0,
                    },
                },
                {
                    kind: "missing_file_size_metadata",
                    userID: "missing-size-user",
                    videoIDs: ["video-without-size"],
                },
                {
                    kind: "missing_persisted_usage",
                    userID: "missing-usage-user",
                    expectedUsage: {
                        storedVideoBytes: 0,
                        pendingVideoBytes: 0,
                        videoCount: 0,
                        segmentCount: 0,
                        pendingVideoUploadCount: 0,
                    },
                },
            ],
        });
    });
});
