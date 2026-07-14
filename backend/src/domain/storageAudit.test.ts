import { describe, expect, it } from "vitest";
import { auditStorageState, type AuditedVideo } from "./storageAudit";

const now = new Date("2026-07-08T10:00:00.000Z");
const oneHour = 60 * 60 * 1000;

function video(overrides: Partial<AuditedVideo>): AuditedVideo {
    return {
        id: "video-1",
        title: "Lesson video",
        storageKey: "users/user-1/videos/video-1.mp4",
        status: "ready",
        createdAt: now,
        ...overrides,
    };
}

describe("auditStorageState", () => {
    it("marks a ready video as healthy when its object exists in one provider", () => {
        const report = auditStorageState({
            videos: [video({})],
            storageKeys: {
                minio: new Set(["users/user-1/videos/video-1.mp4"]),
                awsS3: new Set(),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.healthy).toEqual([
            {
                videoId: "video-1",
                title: "Lesson video",
                storageKey: "users/user-1/videos/video-1.mp4",
                providerName: "minio",
            },
        ]);
        expect(report.issues).toEqual([]);
    });

    it("reports a ready video whose object is missing from storage", () => {
        const report = auditStorageState({
            videos: [video({})],
            storageKeys: {
                minio: new Set(),
                awsS3: new Set(),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([
            {
                kind: "missing_object",
                videoId: "video-1",
                title: "Lesson video",
                storageKey: "users/user-1/videos/video-1.mp4",
            },
        ]);
    });

    it("reports an object that exists in storage but has no database row", () => {
        const report = auditStorageState({
            videos: [],
            storageKeys: {
                minio: new Set(["users/user-1/videos/orphan.mp4"]),
                awsS3: new Set(),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([
            {
                kind: "orphan_object",
                providerName: "minio",
                storageKey: "users/user-1/videos/orphan.mp4",
            },
        ]);
    });

    it("reports a video object that exists in both providers", () => {
        const report = auditStorageState({
            videos: [video({})],
            storageKeys: {
                minio: new Set(["users/user-1/videos/video-1.mp4"]),
                awsS3: new Set(["users/user-1/videos/video-1.mp4"]),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([
            {
                kind: "duplicate_object",
                videoId: "video-1",
                title: "Lesson video",
                storageKey: "users/user-1/videos/video-1.mp4",
            },
        ]);
    });

    it("reports a video row without a storage key", () => {
        const report = auditStorageState({
            videos: [video({ storageKey: null })],
            storageKeys: {
                minio: new Set(),
                awsS3: new Set(),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([
            {
                kind: "missing_storage_key",
                videoId: "video-1",
                title: "Lesson video",
            },
        ]);
    });

    it("reports an old pending upload", () => {
        const report = auditStorageState({
            videos: [
                video({
                    status: "pending_upload",
                    createdAt: new Date(now.getTime() - 2 * oneHour),
                }),
            ],
            storageKeys: {
                minio: new Set(),
                awsS3: new Set(),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([
            {
                kind: "stale_pending_upload",
                videoId: "video-1",
                title: "Lesson video",
                storageKey: "users/user-1/videos/video-1.mp4",
            },
        ]);
    });

    it("does not report a recent pending upload as stale", () => {
        const report = auditStorageState({
            videos: [
                video({
                    status: "pending_upload",
                    createdAt: new Date(now.getTime() - 30 * 60 * 1000),
                }),
            ],
            storageKeys: {
                minio: new Set(),
                awsS3: new Set(),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([]);
    });

    it("reports a failed upload that still has a stored object", () => {
        const report = auditStorageState({
            videos: [video({ status: "upload_failed" })],
            storageKeys: {
                minio: new Set(),
                awsS3: new Set(["users/user-1/videos/video-1.mp4"]),
            },
            now,
            pendingUploadMaxAgeMilliseconds: oneHour,
        });

        expect(report.issues).toEqual([
            {
                kind: "failed_upload_has_object",
                videoId: "video-1",
                title: "Lesson video",
                storageKey: "users/user-1/videos/video-1.mp4",
                providerName: "awsS3",
            },
        ]);
    });
});
