import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getMinioVideoStorageEndpoint,
    selectLocalNetworkIPv4Address,
} from "./videoStorageConfig";

describe("local video storage endpoint", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("prefers a normal LAN address over a Docker network address", () => {
        expect(
            selectLocalNetworkIPv4Address([
                "172.26.0.1",
                "192.168.68.56",
            ])
        ).toBe("192.168.68.56");
    });

    it("uses an explicitly configured endpoint when provided", () => {
        vi.stubEnv("S3_ENDPOINT", "http://10.0.0.25:9000");

        expect(getMinioVideoStorageEndpoint()).toBe(
            "http://10.0.0.25:9000"
        );
    });

    it("explains how to recover when no private address exists", () => {
        expect(() =>
            selectLocalNetworkIPv4Address([
                "127.0.0.1",
                "203.0.113.10",
            ])
        ).toThrow("configure S3_ENDPOINT explicitly");
    });
});
