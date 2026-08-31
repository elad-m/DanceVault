import { describe, expect, it } from "vitest";
import type { UserQuotaReconciliationReport } from "../domain/userQuota";
import {
    createUserQuotaUsageBackfillInputs,
    parseUserQuotaAuditCommandOptions,
} from "./auditUserQuotaUsage";

describe("parseUserQuotaAuditCommandOptions", () => {
    it("uses read-only audit mode by default", () => {
        expect(parseUserQuotaAuditCommandOptions([])).toEqual({
            mode: "audit",
        });
    });

    it("requires apply mode and an exact table confirmation together", () => {
        expect(
            parseUserQuotaAuditCommandOptions([
                "--apply",
                "--confirm-table=DanceVaultLocalData",
            ])
        ).toEqual({
            mode: "apply",
            confirmedTableName: "DanceVaultLocalData",
        });

        expect(() =>
            parseUserQuotaAuditCommandOptions(["--apply"])
        ).toThrow("--confirm-table=<exact table name>");
    });
});

describe("createUserQuotaUsageBackfillInputs", () => {
    const expectedUsage = {
        storedVideoBytes: 100,
        pendingVideoBytes: 0,
        videoCount: 1,
        segmentCount: 2,
        pendingVideoUploadCount: 0,
    };

    it("plans writes only for missing persisted usage", () => {
        const report: UserQuotaReconciliationReport = {
            healthy: [],
            issues: [
                {
                    kind: "missing_persisted_usage",
                    userID: "user-1",
                    expectedUsage,
                },
            ],
        };

        expect(
            createUserQuotaUsageBackfillInputs(report)
        ).toEqual([
            {
                userID: "user-1",
                ...expectedUsage,
            },
        ]);
    });

    it.each(["usage_mismatch", "missing_file_size_metadata"] as const)(
        "blocks writes for a %s issue",
        (kind) => {
            const issue =
                kind === "usage_mismatch"
                    ? {
                          kind,
                          userID: "user-1",
                          expectedUsage,
                          persistedUsage: {
                              ...expectedUsage,
                              videoCount: 2,
                          },
                      }
                    : {
                          kind,
                          userID: "user-1",
                          videoIDs: ["video-1"],
                      };
            const report: UserQuotaReconciliationReport = {
                healthy: [],
                issues: [issue],
            };

            expect(() =>
                createUserQuotaUsageBackfillInputs(report)
            ).toThrow("Quota backfill is blocked");
        }
    );
});
