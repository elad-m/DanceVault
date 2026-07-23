import { describe, expect, it } from "vitest";
import {
    createSegmentItem,
    createVideoItem,
} from "./dynamoDBItems";

describe("createVideoItem", () => {
    it("converts a video into its DynamoDB item shape", () => {
        const item = createVideoItem({
            videoID: "video-1",
            userID: "user-1",
            title: "Salsa lesson",
            sourceType: "youtube",
            sourceURL:
                "https://youtube.com/watch?v=video-1",
            storageKey: null,
            storageProviderName: null,
            originalFileName: null,
            status: "ready",
            createdAt: new Date(
                "2026-07-20T12:34:56.789Z"
            ),
        });

        expect(item).toEqual({
            PK: "USER#user-1",
            SK: "VIDEO#video-1",
            UserContentPK: "USER#user-1",
            UserContentSK:
                "VIDEO#2026-07-20T12:34:56.789Z#video-1",

            entityType: "video",
            schemaVersion: 1,
            videoID: "video-1",
            userID: "user-1",
            title: "Salsa lesson",
            sourceType: "youtube",
            sourceURL:
                "https://youtube.com/watch?v=video-1",
            storageKey: null,
            storageProviderName: null,
            originalFileName: null,
            status: "ready",
            createdAt: "2026-07-20T12:34:56.789Z",
        });
    });
});

describe("createSegmentItem", () => {
    it("converts a segment into its DynamoDB item shape", () => {
        const item = createSegmentItem({
            segmentID: "segment-1",
            videoID: "video-1",
            userID: "user-1",
            name: "Open stance wave",
            description: null,
            startMilliseconds: 15000,
            endMilliseconds: 22000,
            tags: ["wave", "open-stance"],
            difficulty: "medium",
            confidence: "low",
            practicePriority: "high",
            videoSourceType: "youtube",
            videoSourceURL:
                "https://youtube.com/watch?v=video-1",
            createdAt: new Date(
                "2026-07-20T12:35:00.000Z"
            ),
        });

        expect(item).toEqual({
            PK: "USER#user-1",
            SK: "SEGMENT#segment-1",
            VideoPK: "USER#user-1#VIDEO#video-1",
            VideoSK:
                "SEGMENT#000000015000#segment-1",
            UserContentPK: "USER#user-1",
            UserContentSK:
                "SEGMENT#2026-07-20T12:35:00.000Z#segment-1",

            entityType: "segment",
            schemaVersion: 1,
            segmentID: "segment-1",
            videoID: "video-1",
            userID: "user-1",
            name: "Open stance wave",
            description: null,
            startMilliseconds: 15000,
            endMilliseconds: 22000,
            tags: ["wave", "open-stance"],
            difficulty: "medium",
            confidence: "low",
            practicePriority: "high",
            videoSourceType: "youtube",
            videoSourceURL:
                "https://youtube.com/watch?v=video-1",
            createdAt: "2026-07-20T12:35:00.000Z",
        });
    });
});
