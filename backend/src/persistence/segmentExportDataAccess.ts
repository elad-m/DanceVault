import type { SegmentExportStatus } from "../domain/segmentExport";

export type SegmentExportDataAccessItem = {
    id: string;
    segmentId: string;
    videoId: string;
    sourceStorageKey: string;
    outputStorageKey: string;
    startMilliseconds: number;
    endMilliseconds: number;
    status: SegmentExportStatus;
    failureMessage?: string;
    outputSizeBytes?: number;
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
};

export type CreateSegmentExportInput = {
    exportID: string;
    userID: string;
    segmentID: string;
    videoID: string;
    sourceStorageKey: string;
    outputStorageKey: string;
    startMilliseconds: number;
    endMilliseconds: number;
    createdAt: Date;
};

export type CreateSegmentExportResult =
    | { kind: "created"; export: SegmentExportDataAccessItem }
    | { kind: "existing"; export: SegmentExportDataAccessItem }
    | { kind: "busy" };

export type SegmentExportDataAccess = {
    createSegmentExport(
        input: CreateSegmentExportInput
    ): Promise<CreateSegmentExportResult>;
    getSegmentExport(input: {
        userID: string;
        segmentID: string;
    }): Promise<SegmentExportDataAccessItem | null>;
    markSegmentExportProcessing(input: {
        userID: string;
        segmentID: string;
        exportID: string;
        updatedAt: Date;
    }): Promise<void>;
    markSegmentExportReady(input: {
        userID: string;
        segmentID: string;
        exportID: string;
        outputSizeBytes: number;
        expiresAt: Date;
        updatedAt: Date;
    }): Promise<void>;
    markSegmentExportFailed(input: {
        userID: string;
        segmentID: string;
        exportID: string;
        failureMessage: string;
        updatedAt: Date;
    }): Promise<void>;
    deleteSegmentExport(input: {
        userID: string;
        segmentID: string;
        exportID: string;
    }): Promise<void>;
};
