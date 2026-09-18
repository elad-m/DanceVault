import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearDynamoDBTestDatabase } from "../test/dynamoDBTestDatabase";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import { createDynamoDBSegmentExportDataAccess } from "./dynamoDBSegmentExportDataAccess";

const connection = createDynamoDBConnection();
const dataAccess = createDynamoDBSegmentExportDataAccess(connection);

beforeEach(clearDynamoDBTestDatabase);
afterAll(() => connection.close());

function createInput(segmentID: string, exportID: string) {
    return {
        exportID,
        userID: "segment-export-user",
        segmentID,
        videoID: "video-1",
        sourceStorageKey: "users/segment-export-user/videos/video-1.mov",
        outputStorageKey:
            `users/segment-export-user/exports/segments/${segmentID}/${exportID}.mp4`,
        startMilliseconds: 1_000,
        endMilliseconds: 11_000,
        createdAt: new Date("2026-09-16T08:00:00.000Z"),
    };
}

describe("DynamoDB segment export data access", () => {
    it("allows only one active export per user and releases the lock on completion", async () => {
        const first = createInput("segment-1", "export-1");
        const second = createInput("segment-2", "export-2");

        await expect(dataAccess.createSegmentExport(first)).resolves.toMatchObject({
            kind: "created",
            export: { id: "export-1", status: "queued" },
        });
        await expect(dataAccess.createSegmentExport(second)).resolves.toEqual({
            kind: "busy",
        });

        await dataAccess.markSegmentExportProcessing({
            userID: first.userID,
            segmentID: first.segmentID,
            exportID: first.exportID,
            updatedAt: new Date("2026-09-16T08:00:01.000Z"),
        });
        await dataAccess.markSegmentExportReady({
            userID: first.userID,
            segmentID: first.segmentID,
            exportID: first.exportID,
            outputSizeBytes: 1234,
            expiresAt: new Date("2026-09-23T08:00:02.000Z"),
            updatedAt: new Date("2026-09-16T08:00:02.000Z"),
        });

        await expect(dataAccess.createSegmentExport(second)).resolves.toMatchObject({
            kind: "created",
            export: { id: "export-2", status: "queued" },
        });
        await expect(
            dataAccess.getSegmentExport({
                userID: first.userID,
                segmentID: first.segmentID,
            })
        ).resolves.toMatchObject({
            status: "ready",
            outputSizeBytes: 1234,
        });
    });

    it("reuses the current export for an idempotent request", async () => {
        const input = createInput("segment-1", "export-1");
        await dataAccess.createSegmentExport(input);

        const repeated = await dataAccess.createSegmentExport({
            ...input,
            exportID: "ignored-new-export-id",
        });

        expect(repeated).toMatchObject({
            kind: "existing",
            export: { id: "export-1", status: "queued" },
        });
    });

    it("atomically deletes an export and its active user lock", async () => {
        const first = createInput("segment-1", "export-1");
        const second = createInput("segment-2", "export-2");
        await dataAccess.createSegmentExport(first);

        await dataAccess.deleteSegmentExport({
            userID: first.userID,
            segmentID: first.segmentID,
            exportID: first.exportID,
        });

        await expect(
            dataAccess.getSegmentExport({
                userID: first.userID,
                segmentID: first.segmentID,
            })
        ).resolves.toBeNull();
        await expect(
            dataAccess.createSegmentExport(second)
        ).resolves.toMatchObject({ kind: "created" });
    });

    it("replaces a ready export after its expiration time", async () => {
        const first = createInput("segment-1", "export-1");
        await dataAccess.createSegmentExport(first);
        await dataAccess.markSegmentExportReady({
            userID: first.userID,
            segmentID: first.segmentID,
            exportID: first.exportID,
            outputSizeBytes: 1234,
            expiresAt: new Date("2026-09-17T08:00:00.000Z"),
            updatedAt: new Date("2026-09-16T08:00:02.000Z"),
        });

        const replacement = {
            ...first,
            exportID: "export-2",
            createdAt: new Date("2026-09-18T08:00:00.000Z"),
        };

        await expect(
            dataAccess.createSegmentExport(replacement)
        ).resolves.toMatchObject({
            kind: "created",
            export: { id: "export-2" },
        });
    });

    it("releases a stale queued export lock after its lease expires", async () => {
        const stale = createInput("segment-1", "export-1");
        await dataAccess.createSegmentExport(stale);

        const replacement = {
            ...createInput("segment-2", "export-2"),
            createdAt: new Date("2026-10-02T08:00:00.000Z"),
        };

        await expect(
            dataAccess.createSegmentExport(replacement)
        ).resolves.toMatchObject({
            kind: "created",
            export: { id: "export-2", status: "queued" },
        });
    });
});
