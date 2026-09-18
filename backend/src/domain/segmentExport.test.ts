import { describe, expect, it } from "vitest";
import {
    createSegmentExportStorageKey,
    validateSegmentExportDuration,
} from "./segmentExport";

describe("segment export", () => {
    it("creates a user-owned export storage key", () => {
        expect(
            createSegmentExportStorageKey({
                userID: "user/1",
                segmentID: "segment 1",
                exportID: "export-1",
            })
        ).toBe(
            "users/user%2F1/exports/segments/segment%201/export-1.mp4"
        );
    });

    it("accepts exports up to 30 seconds", () => {
        expect(() =>
            validateSegmentExportDuration({
                startMilliseconds: 2_000,
                endMilliseconds: 32_000,
            })
        ).not.toThrow();
    });

    it.each([
        [1_000, 1_000],
        [2_000, 1_000],
        [0, 30_001],
    ])("rejects invalid export range %s-%s", (start, end) => {
        expect(() =>
            validateSegmentExportDuration({
                startMilliseconds: start,
                endMilliseconds: end,
            })
        ).toThrow(
            "Segment exports must be longer than zero and no longer than 30 seconds"
        );
    });
});
