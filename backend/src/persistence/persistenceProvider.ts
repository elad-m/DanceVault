// Selects the environment's data-access implementations and owns their connections.

import { prisma } from "../db";
import { runtime } from "../runtime";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import { createDynamoDBVideoDataAccess } from "./dynamoDBVideoDataAccess";
import { prismaVideoDataAccess } from "./prismaVideoDataAccess";
import type { VideoDataAccess } from "./videoDataAccess";

export type PersistenceProvider = {
    videoDataAccess: VideoDataAccess;
    close(): Promise<void>;
};

export function createPersistenceProvider(): PersistenceProvider {
    if (runtime.environment === "local") {
        return {
            videoDataAccess: prismaVideoDataAccess,

            async close() {
                await prisma.$disconnect();
            },
        };
    }

    const connection = createDynamoDBConnection();

    return {
        videoDataAccess:
            createDynamoDBVideoDataAccess(connection),

        async close() {
            connection.close();
        },
    };
}
