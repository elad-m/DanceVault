import { describe, expect, it } from "vitest";
import {
    createVideoThumbnailStorageKey,
    maxVideoThumbnailSizeBytes,
    videoThumbnailContentType,
} from "./video";

describe("video thumbnail storage contract", () => {
    it("derives a JPEG storage key from the user and video IDs", () => {
        expect(
            createVideoThumbnailStorageKey({
                userId: "user/with/slashes",
                videoId: "video-1",
            })
        ).toBe(
            "users/user%2Fwith%2Fslashes/thumbnails/videos/video-1.jpg"
        );
    });

    it("defines the supported thumbnail format and size limit", () => {
        expect(videoThumbnailContentType).toBe("image/jpeg");
        expect(maxVideoThumbnailSizeBytes).toBe(250_000);
    });
});
