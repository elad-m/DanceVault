export type UserIdentityProvider = {
    // Repeated deletion of an already-absent identity must succeed.
    deleteUser(input: {
        identityProviderUserID: string;
    }): Promise<void>;
    close(): void;
};
