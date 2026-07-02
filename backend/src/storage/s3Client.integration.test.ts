import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import {
    createVideoPlaybackUrl,
    createVideoUploadUrl,
    s3Client,
    videoBucketName,
    videoObjectExists,
} from "./s3Client";

describe("S3 video storage integration", () => {
    afterAll(() => {
        s3Client.destroy();
    });

    it("uploads and downloads through signed URLs", async () => {
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
        } finally {
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: videoBucketName,
                    Key: storageKey,
                })
            );
        }
    });
});
