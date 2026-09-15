import type { UserAccountLifecycle } from "../domain/userAccount";
import type {
    LegalPolicyVersions,
    UserLegalAcceptance,
} from "../domain/legalAcceptance";

export type UserAccountDataAccess = {
    getUserAccountLifecycle(input: {
        userID: string;
    }): Promise<UserAccountLifecycle | null>;
    getUserLegalAcceptance(input: {
        userID: string;
    }): Promise<UserLegalAcceptance | null>;
    acceptLegalPolicies(input: {
        userID: string;
        versions: LegalPolicyVersions;
        acceptedAt: Date;
    }): Promise<UserLegalAcceptance>;
    startUserAccountDeletion(input: {
        userID: string;
        requestedAt: Date;
    }): Promise<UserAccountLifecycle>;
};
