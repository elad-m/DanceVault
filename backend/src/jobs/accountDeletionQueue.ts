export const CURRENT_ACCOUNT_DELETION_JOB_SCHEMA_VERSION = 1 as const;

export type AccountDeletionJob = {
    schemaVersion:
        typeof CURRENT_ACCOUNT_DELETION_JOB_SCHEMA_VERSION;
    jobID: string;
    userID: string;
    identityProviderUserID: string;
    deletionRequestedAt: string;
};

export type AccountDeletionQueue = {
    enqueue(job: AccountDeletionJob): Promise<void>;
    close(): void;
};

export function parseAccountDeletionJob(
    messageBody: string
): AccountDeletionJob {
    try {
        const parsedValue: unknown = JSON.parse(messageBody);

        if (!isAccountDeletionJob(parsedValue)) {
            throw new Error();
        }

        return parsedValue;
    } catch {
        throw new Error("Invalid account deletion job");
    }
}

function isAccountDeletionJob(
    value: unknown
): value is AccountDeletionJob {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        candidate.schemaVersion ===
            CURRENT_ACCOUNT_DELETION_JOB_SCHEMA_VERSION &&
        isNonEmptyString(candidate.jobID) &&
        isNonEmptyString(candidate.userID) &&
        isNonEmptyString(candidate.identityProviderUserID) &&
        isCanonicalTimestamp(candidate.deletionRequestedAt)
    );
}

function isNonEmptyString(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0
    );
}

function isCanonicalTimestamp(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }

    const milliseconds = Date.parse(value);

    return (
        !Number.isNaN(milliseconds) &&
        new Date(milliseconds).toISOString() === value
    );
}
