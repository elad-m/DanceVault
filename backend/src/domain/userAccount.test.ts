import { describe, expect, it } from "vitest";
import {
    getUserAccountStatus,
    startUserAccountDeletion,
} from "./userAccount";

describe("getUserAccountStatus", () => {
    it("treats an account without a lifecycle record as active", () => {
        expect(getUserAccountStatus(null)).toBe("active");
    });

    it("returns the stored account status", () => {
        expect(
            getUserAccountStatus({
                status: "deleting",
                deletionRequestedAt: "2026-09-10T12:00:00.000Z",
            })
        ).toBe("deleting");
        expect(
            getUserAccountStatus({
                status: "deleted",
                deletionRequestedAt: "2026-09-10T12:00:00.000Z",
            })
        ).toBe("deleted");
    });
});

describe("startUserAccountDeletion", () => {
    it("moves an existing account into the deleting state", () => {
        expect(
            startUserAccountDeletion(
                {
                    status: "active",
                    deletionRequestedAt: null,
                },
                "2026-09-10T12:00:00.000Z"
            )
        ).toEqual({
            status: "deleting",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        });
    });

    it("supports existing users without requiring a backfill", () => {
        expect(
            startUserAccountDeletion(
                null,
                "2026-09-10T12:00:00.000Z"
            )
        ).toEqual({
            status: "deleting",
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        });
    });

    it("keeps the original request when deletion is requested again", () => {
        const deletingAccount = {
            status: "deleting" as const,
            deletionRequestedAt: "2026-09-10T12:00:00.000Z",
        };

        expect(
            startUserAccountDeletion(
                deletingAccount,
                "2026-09-11T12:00:00.000Z"
            )
        ).toBe(deletingAccount);
    });

    it("rejects an invalid request timestamp", () => {
        expect(() =>
            startUserAccountDeletion(null, "not-a-timestamp")
        ).toThrow(
            "Account deletion request time must be a valid timestamp"
        );
    });

    it("does not restart deletion for a deleted account", () => {
        expect(() =>
            startUserAccountDeletion(
                {
                    status: "deleted",
                    deletionRequestedAt:
                        "2026-09-10T12:00:00.000Z",
                },
                "2026-09-11T12:00:00.000Z"
            )
        ).toThrow("Deleted account cannot restart deletion");
    });
});
