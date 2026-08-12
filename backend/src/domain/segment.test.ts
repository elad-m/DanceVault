import { describe, expect, it } from "vitest";
import {
    createSegmentThumbnailStorageKey,
    maxSegmentThumbnailSizeBytes,
    segmentThumbnailContentType,
} from "./segment";

describe("segment thumbnail storage contract", () => {
    it("creates a user-scoped JPEG storage key", () => {
        expect(
            createSegmentThumbnailStorageKey({
                userId: "user/with/slashes",
                segmentId: "segment-1",
            })
        ).toBe(
            "users/user%2Fwith%2Fslashes/thumbnails/segment-1.jpg"
        );
    });

    it("defines the supported thumbnail format and size limit", () => {
        expect(segmentThumbnailContentType).toBe("image/jpeg");
        expect(maxSegmentThumbnailSizeBytes).toBe(250_000);
    });
});