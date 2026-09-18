import { describe, expect, it } from "vitest";
import { parseSegmentExportJob } from "./segmentExportQueue";

const validJob = {
    schemaVersion: 1,
    exportID: "export-1",
    userID: "user-1",
    segmentID: "segment-1",
    sourceStorageKey: "users/user-1/videos/video-1.mov",
    outputStorageKey:
        "users/user-1/exports/segments/segment-1/export-1.mp4",
    startMilliseconds: 1_000,
    endMilliseconds: 5_000,
};

describe("parseSegmentExportJob", () => {
    it("parses a valid versioned job", () => {
        expect(parseSegmentExportJob(JSON.stringify(validJob))).toEqual(
            validJob
        );
    });

    it.each([
        "not json",
        JSON.stringify({ ...validJob, schemaVersion: 2 }),
        JSON.stringify({ ...validJob, outputStorageKey: "" }),
        JSON.stringify({ ...validJob, endMilliseconds: 500 }),
    ])("rejects an invalid job", (body) => {
        expect(() => parseSegmentExportJob(body)).toThrow(
            "Invalid segment export job"
        );
    });
});
