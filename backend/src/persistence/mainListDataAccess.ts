// Stores membership and order together; version 0 represents an unsaved list.
export const MAX_MAIN_LIST_SEGMENTS = 500;

export type MainListDataAccessItem = {
    segmentIDs: string[];
    version: number;
};

export type MainListDataAccess = {
    getMainList(input: { userID: string }): Promise<MainListDataAccessItem>;
    saveMainList(input: {
        userID: string;
        segmentIDs: string[];
        expectedVersion: number;
    }): Promise<MainListDataAccessItem | null>;
};
