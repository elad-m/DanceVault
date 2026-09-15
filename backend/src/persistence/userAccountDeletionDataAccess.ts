export type UserAccountDeletionDataAccess = {
    // Deletes user-owned application records but preserves the lifecycle marker.
    deleteUserData(input: { userID: string }): Promise<void>;

    // Replaces the deleting marker with a temporary deleted-account tombstone.
    completeUserAccountDeletion(input: {
        userID: string;
        deletionRequestedAt: string;
        completedAt: Date;
    }): Promise<void>;
};
