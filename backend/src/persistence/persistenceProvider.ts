// Selects the environment's data-access implementations and owns their connection.

import { createDynamoDBConnection } from "./dynamoDBConnection";
import { createDynamoDBSegmentDataAccess } from "./dynamoDBSegmentDataAccess";
import { createDynamoDBVideoDataAccess } from "./dynamoDBVideoDataAccess";
import type { SegmentDataAccess } from "./segmentDataAccess";
import type { VideoDataAccess } from "./videoDataAccess";
import { createDynamoDBMainListDataAccess } from "./dynamoDBMainListDataAccess";
import type { MainListDataAccess } from "./mainListDataAccess";

export type PersistenceProvider = {
    mainListDataAccess: MainListDataAccess;
    videoDataAccess: VideoDataAccess;
    segmentDataAccess: SegmentDataAccess;
    close(): Promise<void>;
};

export function createPersistenceProvider(): PersistenceProvider {
    const connection = createDynamoDBConnection();

    return {
        mainListDataAccess: createDynamoDBMainListDataAccess(connection),
        videoDataAccess:
            createDynamoDBVideoDataAccess(connection),
        segmentDataAccess:
            createDynamoDBSegmentDataAccess(connection),

        async close() {
            connection.close();
        },
    };
}
