export type UserAccountStatus = "active" | "deleting" | "deleted";

export const deletedAccountTombstoneRetentionSeconds =
    7 * 24 * 60 * 60;

export type UserAccountLifecycle = {
    status: UserAccountStatus;
    deletionRequestedAt: string | null;
};

export function getUserAccountStatus(
    lifecycle: UserAccountLifecycle | null
): UserAccountStatus {
    return lifecycle?.status ?? "active";
}

export function startUserAccountDeletion(
    lifecycle: UserAccountLifecycle | null,
    requestedAt: string
): UserAccountLifecycle {
    if (lifecycle?.status === "deleting") {
        return lifecycle;
    }

    if (lifecycle?.status === "deleted") {
        throw new Error("Deleted account cannot restart deletion");
    }

    if (Number.isNaN(Date.parse(requestedAt))) {
        throw new Error(
            "Account deletion request time must be a valid timestamp"
        );
    }

    return {
        status: "deleting",
        deletionRequestedAt: requestedAt,
    };
}
