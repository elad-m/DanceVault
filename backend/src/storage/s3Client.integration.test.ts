import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import {
    createVideoUploadUrl,
    s3Client,
    videoBucketName,
    videoObjectExists,
} from "./s3Client";

describe("S3 video storage integration", () => {
    afterAll(() => {
        s3Client.destroy();
    });

    it("uploads through a signed URL and finds the stored object", async () => {
        const storageKey = `integration-tests/${randomUUID()}.mp4`;

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
                body: new TextEncoder().encode(
                    "DanceVault storage integration test"
                ),
            });

            expect(uploadResponse.status).toBe(200);
            expect(await videoObjectExists(storageKey)).toBe(true);
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
