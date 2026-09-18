import type { FastifyInstance } from "fastify";
import type { SegmentExportDataAccess } from "../persistence/segmentExportDataAccess";
import type { SegmentExportStorageProvider } from "../storage/segmentExportStorageProvider";

export const TEST_USER_ID = "test-user-1";
export const OTHER_TEST_USER_ID = "test-user-2";
export const OTHER_TEST_VIDEO_ID = "other-user-video";
export const OTHER_TEST_SEGMENT_ID = "other-user-segment";

export function registerTestAuthentication(app: FastifyInstance) {
    app.addHook("onRequest", async (request) => {
        request.headers["x-user-id"] = TEST_USER_ID;
    });
}

export function createUnusedSegmentExportDataAccess(): SegmentExportDataAccess {
    return {
        async createSegmentExport() {
            throw new Error("Segment export data access was not expected");
        },
        async getSegmentExport() {
            throw new Error("Segment export data access was not expected");
        },
        async markSegmentExportProcessing() {
            throw new Error("Segment export data access was not expected");
        },
        async markSegmentExportReady() {
            throw new Error("Segment export data access was not expected");
        },
        async markSegmentExportFailed() {
            throw new Error("Segment export data access was not expected");
        },
        async deleteSegmentExport() {
            throw new Error("Segment export data access was not expected");
        },
    };
}

export function createUnusedSegmentExportStorageProvider(): SegmentExportStorageProvider {
    return {
        async downloadSourceVideoToFile() {
            throw new Error("Segment export storage was not expected");
        },
        async uploadSegmentExportFromFile() {
            throw new Error("Segment export storage was not expected");
        },
        async createSegmentExportDownloadUrl() {
            throw new Error("Segment export storage was not expected");
        },
        async deleteSegmentExportObject() {
            throw new Error("Segment export storage was not expected");
        },
        close() {},
    };
}
