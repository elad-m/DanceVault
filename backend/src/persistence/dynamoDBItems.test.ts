import { describe, expect, it } from "vitest";
import {
    createSegmentItem,
    createDynamoDBVideoItem,
} from "./dynamoDBItems";

describe("createDynamoDBVideoItem", () => {
    it("converts a video into its DynamoDB item shape", () => {
        const item = createDynamoDBVideoItem({
            videoID: "video-1",
            userID: "user-1",
            title: "Salsa lesson",
            storageKey: "users/user-1/videos/video-1.mp4",
            storageProviderName: "awsS3",
            originalFileName: "video-1.mp4",
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
            schemaVersion: 3,
            videoID: "video-1",
            userID: "user-1",
            title: "Salsa lesson",
            storageKey: "users/user-1/videos/video-1.mp4",
            storageProviderName: "awsS3",
            originalFileName: "video-1.mp4",
            status: "ready",
            segmentCount: 0,
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
            schemaVersion: 2,
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
            createdAt: "2026-07-20T12:35:00.000Z",
        });
    });
});
