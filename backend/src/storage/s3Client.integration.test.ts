import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
    createVideoPlaybackUrl,
    createVideoUploadUrl,
    deleteVideoObject,
    s3Client,
    videoObjectExists,
} from "./s3Client";

describe("S3 video storage integration", () => {
    afterAll(() => {
        s3Client.destroy();
    });

    it("uploads, downloads, and deletes an object", async () => {
        const storageKey = `integration-tests/${randomUUID()}.mp4`;
        const objectContents = "DanceVault storage integration test";

        try {
            expect(await videoObjectExists(storageKey)).toBe(false);

            const uploadUrl = await createVideoUploadUrl({
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
            expect(await videoObjectExists(storageKey)).toBe(true);

            const playbackUrl =
                await createVideoPlaybackUrl(storageKey);
            const playbackResponse = await fetch(playbackUrl);

            expect(playbackResponse.status).toBe(200);
            expect(await playbackResponse.text()).toBe(objectContents);

            await deleteVideoObject(storageKey);

            expect(await videoObjectExists(storageKey)).toBe(false);
        } finally {
            await deleteVideoObject(storageKey);
        }
    });
});
