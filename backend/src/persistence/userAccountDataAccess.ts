import type { UserAccountLifecycle } from "../domain/userAccount";

export type UserAccountDataAccess = {
    getUserAccountLifecycle(input: {
        userID: string;
    }): Promise<UserAccountLifecycle | null>;
    startUserAccountDeletion(input: {
        userID: string;
        requestedAt: Date;
    }): Promise<UserAccountLifecycle>;
};
