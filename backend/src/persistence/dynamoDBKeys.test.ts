import { describe, expect, it } from "vitest";
import {
    createSegmentItemKeys,
    createVideoItemKeys,
} from "./dynamoDBKeys";

describe("createVideoItemKeys", () => {
    it("creates ownership and chronological keys", () => {
        const keys = createVideoItemKeys({
            userID: "user-1",
            videoID: "video-1",
            createdAt: new Date(
                "2026-07-20T12:34:56.789Z"
            ),
        });

        expect(keys).toEqual({
            PK: "USER#user-1",
            SK: "VIDEO#video-1",
            UserContentPK: "USER#user-1",
            UserContentSK:
                "VIDEO#2026-07-20T12:34:56.789Z#video-1",
        });
    });
});

describe("createSegmentItemKeys", () => {
    it("creates ownership, video, and chronological keys", () => {
        const keys = createSegmentItemKeys({
            userID: "user-1",
            videoID: "video-1",
            segmentID: "segment-1",
            startMilliseconds: 15000,
            createdAt: new Date(
                "2026-07-20T12:35:00.000Z"
            ),
        });

        expect(keys).toEqual({
            PK: "USER#user-1",
            SK: "SEGMENT#segment-1",
            VideoPK: "VIDEO#video-1",
            VideoSK:
                "SEGMENT#000000015000#segment-1",
            UserContentPK: "USER#user-1",
            UserContentSK:
                "SEGMENT#2026-07-20T12:35:00.000Z#segment-1",
        });
    });
});