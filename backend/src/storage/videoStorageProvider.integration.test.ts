import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createVideoStorageProvider } from "./videoStorageProvider";
import { getActiveVideoStorageProviderName } from "./videoStorageConfig";

const videoStorageProvider = createVideoStorageProvider(
    getActiveVideoStorageProviderName()
);

describe("S3 video storage integration", () => {
    afterAll(() => {
        videoStorageProvider.close();
    });

    it("uploads, downloads, and deletes an object", async () => {
        const storageKey = `integration-tests/${randomUUID()}.mp4`;
        const objectContents = "DanceVault storage integration test";
        const objectBytes = new TextEncoder().encode(objectContents);

        try {
            expect(
                await videoStorageProvider.getVideoObjectSizeBytes(
                    storageKey
                )
            ).toBeNull();

            const uploadUrl =
                await videoStorageProvider.createVideoUploadUrl({
                    storageKey,
                    contentType: "video/mp4",
                });
            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                headers: {
                    "content-type": "video/mp4",
                },
                body: objectBytes,
            });

            expect(uploadResponse.status).toBe(200);
            expect(
                await videoStorageProvider.getVideoObjectSizeBytes(
                    storageKey
                )
            ).toBe(objectBytes.byteLength);

            const playbackUrl =
                await videoStorageProvider.createVideoPlaybackUrl(
                    storageKey
                );
            const playbackResponse = await fetch(playbackUrl);

            expect(playbackResponse.status).toBe(200);
            expect(await playbackResponse.text()).toBe(objectContents);

            await videoStorageProvider.deleteVideoObject(
                storageKey
            );

            expect(
                await videoStorageProvider.getVideoObjectSizeBytes(
                    storageKey
                )
            ).toBeNull();
        } finally {
            await videoStorageProvider.deleteVideoObject(
                storageKey
            );
        }
    });

    it("uploads, downloads, and deletes a segment thumbnail", async () => {
        const storageKey =
            `integration-tests/thumbnails/${randomUUID()}.jpg`;
        const thumbnailBytes = new TextEncoder().encode(
            "DanceVault thumbnail integration test"
        );

        try {
            expect(
                await videoStorageProvider
                    .getSegmentThumbnailObjectSizeBytes(storageKey)
            ).toBeNull();

            const uploadUrl =
                await videoStorageProvider
                    .createSegmentThumbnailUploadUrl(storageKey);

            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                headers: {
                    "content-type": "image/jpeg",
                },
                body: thumbnailBytes,
            });

            expect(uploadResponse.status).toBe(200);
            expect(
                await videoStorageProvider
                    .getSegmentThumbnailObjectSizeBytes(storageKey)
            ).toBe(thumbnailBytes.byteLength);

            const playbackUrl =
                await videoStorageProvider
                    .createSegmentThumbnailPlaybackUrl(storageKey);

            const playbackResponse = await fetch(playbackUrl);

            expect(playbackResponse.status).toBe(200);
            expect(
                new Uint8Array(
                    await playbackResponse.arrayBuffer()
                )
            ).toEqual(thumbnailBytes);

            await videoStorageProvider.deleteSegmentThumbnailObject(
                storageKey
            );

            expect(
                await videoStorageProvider
                    .getSegmentThumbnailObjectSizeBytes(storageKey)
            ).toBeNull();
        } finally {
            await videoStorageProvider.deleteSegmentThumbnailObject(
                storageKey
            );
        }
    });
});
