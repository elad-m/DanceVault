import { describe, expect, it } from "vitest";
import {
    areSegmentTimestampsValid,
    paginateResults,
    toSegmentResponse,
} from "./segmentService";

describe("areSegmentTimestampsValid", () => {
    it("accepts an end time after the start time", () => {
        expect(areSegmentTimestampsValid(10, 20)).toBe(true);
    });

    it("rejects equal start and end times", () => {
        expect(areSegmentTimestampsValid(10, 10)).toBe(false);
    });

    it("rejects an end time before the start time", () => {
        expect(areSegmentTimestampsValid(20, 10)).toBe(false);
    });
});

describe("paginateResults", () => {
    it("returns all results and no cursor when another page does not exist", () => {
        const results = [{ id: "segment-1" }, { id: "segment-2" }];

        expect(paginateResults(results, 2)).toEqual({
            items: results,
            nextCursor: null,
        });
    });

    it("returns the requested page and a cursor when another page exists", () => {
        const results = [
            { id: "segment-1" },
            { id: "segment-2" },
            { id: "segment-3" },
        ];

        expect(paginateResults(results, 2)).toEqual({
            items: [{ id: "segment-1" }, { id: "segment-2" }],
            nextCursor: "segment-2",
        });
    });
});

describe("toSegmentResponse", () => {
    it("adds a playback URL and hides the internal video relation", () => {
        const response = toSegmentResponse({
            id: "segment-1",
            name: "Open stance wave",
            startSeconds: 15,
            video: {
                sourceType: "youtube",
                sourceUrl: "https://youtube.com/watch?v=test-video",
            },
        });

        expect(response).toEqual({
            id: "segment-1",
            name: "Open stance wave",
            startSeconds: 15,
            playbackUrl: "https://youtube.com/watch?v=test-video&t=15s",
        });
        expect(response).not.toHaveProperty("video");
    });
});
