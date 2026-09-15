export const currentLegalPolicyVersions = {
    privacyNotice: "2026-09-15",
    termsOfUse: "2026-09-15",
} as const;

export type LegalPolicyVersions = {
    privacyNotice: string;
    termsOfUse: string;
};

export type UserLegalAcceptance = LegalPolicyVersions & {
    acceptedAt: string;
};

export function isCurrentLegalAcceptance(
    acceptance: UserLegalAcceptance | null
): boolean {
    return (
        acceptance?.privacyNotice ===
            currentLegalPolicyVersions.privacyNotice &&
        acceptance.termsOfUse ===
            currentLegalPolicyVersions.termsOfUse
    );
}
