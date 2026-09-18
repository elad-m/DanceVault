import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createSegmentExportStorageProvider } from "./segmentExportStorageProvider";
import { getActiveVideoStorageProviderName } from "./videoStorageConfig";

const storage = createSegmentExportStorageProvider(
    getActiveVideoStorageProviderName()
);

describe("segment export storage integration", () => {
    afterAll(() => {
        storage.close();
    });

    it("uploads, downloads, and deletes an exported MP4", async () => {
        const directory = await mkdtemp(join(tmpdir(), "dancevault-export-"));
        const sourcePath = join(directory, "export.mp4");
        const storageKey =
            `integration-tests/exports/segments/${randomUUID()}.mp4`;
        const contents = new TextEncoder().encode(
            "DanceVault segment export integration test"
        );

        try {
            await writeFile(sourcePath, contents);
            await storage.uploadSegmentExportFromFile(
                storageKey,
                sourcePath
            );

            const downloadUrl =
                await storage.createSegmentExportDownloadUrl(storageKey);
            const response = await fetch(downloadUrl);

            expect(response.status).toBe(200);
            expect(new Uint8Array(await response.arrayBuffer())).toEqual(
                contents
            );
            expect(response.headers.get("content-type")).toBe("video/mp4");

            await storage.deleteSegmentExportObject(storageKey);

            const deletedResponse = await fetch(
                await storage.createSegmentExportDownloadUrl(storageKey)
            );
            expect(deletedResponse.status).toBe(404);
        } finally {
            await storage.deleteSegmentExportObject(storageKey);
            await rm(directory, { recursive: true, force: true });
        }
    });
});
