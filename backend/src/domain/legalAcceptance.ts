export const currentLegalPolicyVersions = {
    privacyNotice: "2026-08-03",
    termsOfUse: "2026-08-03",
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
