import { describe, expect, it } from "vitest";
import {
    currentLegalPolicyVersions,
    isCurrentLegalAcceptance,
} from "./legalAcceptance";

describe("isCurrentLegalAcceptance", () => {
    it("requires both current policy versions", () => {
        expect(isCurrentLegalAcceptance(null)).toBe(false);
        expect(
            isCurrentLegalAcceptance({
                ...currentLegalPolicyVersions,
                acceptedAt: "2026-09-15T12:00:00.000Z",
            })
        ).toBe(true);
        expect(
            isCurrentLegalAcceptance({
                privacyNotice: "older",
                termsOfUse: currentLegalPolicyVersions.termsOfUse,
                acceptedAt: "2026-09-15T12:00:00.000Z",
            })
        ).toBe(false);
    });
});
