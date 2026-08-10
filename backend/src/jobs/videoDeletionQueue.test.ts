import { describe, expect, it } from "vitest";
import {
    parseVideoDeletionJob,
    type VideoDeletionJob,
} from "./videoDeletionQueue";

describe("parseVideoDeletionJob", () => {
    it("decodes a valid video deletion job", () => {
        const expectedJob: VideoDeletionJob = {
            schemaVersion: 1,
            jobID: "job-1",
            userID: "user-1",
            videoID: "video-1",
        };

        expect(
            parseVideoDeletionJob(
                JSON.stringify(expectedJob)
            )
        ).toEqual(expectedJob);
    });

    it("rejects an unsupported schema version", () => {
        const messageBody = JSON.stringify({
            schemaVersion: 2,
            jobID: "job-1",
            userID: "user-1",
            videoID: "video-1",
        });

        expect(() =>
            parseVideoDeletionJob(messageBody)
        ).toThrow("Invalid video deletion job");
    });

    it("rejects malformed JSON", () => {
        expect(() =>
            parseVideoDeletionJob("not-json")
        ).toThrow("Invalid video deletion job");
    });
});