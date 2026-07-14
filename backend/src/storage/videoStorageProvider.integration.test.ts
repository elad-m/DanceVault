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

        try {
            expect(
                await videoStorageProvider.videoObjectExists(
                    storageKey
                )
            ).toBe(false);

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
                body: new TextEncoder().encode(objectContents),
            });

            expect(uploadResponse.status).toBe(200);
            expect(
                await videoStorageProvider.videoObjectExists(
                    storageKey
                )
            ).toBe(true);

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
                await videoStorageProvider.videoObjectExists(
                    storageKey
                )
            ).toBe(false);
        } finally {
            await videoStorageProvider.deleteVideoObject(
                storageKey
            );
        }
    });
});
