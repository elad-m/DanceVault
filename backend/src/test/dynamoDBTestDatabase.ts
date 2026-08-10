import type { PersistenceProvider } from "../persistence";
import { createDynamoDBConnection } from "../persistence/dynamoDBConnection";
import { createDynamoDBSegmentDataAccess } from "../persistence/dynamoDBSegmentDataAccess";
import { createDynamoDBVideoDataAccess } from "../persistence/dynamoDBVideoDataAccess";
import {
    DeleteCommand,
    ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    OTHER_TEST_SEGMENT_ID,
    OTHER_TEST_USER_ID,
    OTHER_TEST_VIDEO_ID,
    TEST_USER_ID,
} from "./routeTestSupport";
import { assertSafeDynamoDBTestTarget } from "../testEnvironmentSafety";

type ResetDynamoDBTestDatabaseInput = {
    persistenceProvider: PersistenceProvider;
};

export async function resetDynamoDBTestDatabase({
    persistenceProvider,
}: ResetDynamoDBTestDatabaseInput): Promise<void> {
    await clearDynamoDBTestDatabase();

    await persistenceProvider.videoDataAccess.createVideo({
        videoID: "sample-video-1",
        userID: TEST_USER_ID,
        title: "Test lesson summary",
        storageKey: "test-videos/sample-video-1.mp4",
        storageProvider: "minio",
        originalFileName: "sample-video-1.mp4",
        status: "pending_upload",
        createdAt: new Date("2026-07-30T10:00:00.000Z"),
    });

    await persistenceProvider.videoDataAccess.updateVideoStatus({
        userID: TEST_USER_ID,
        videoID: "sample-video-1",
        status: "ready",
    });

    await persistenceProvider.segmentDataAccess.createSegment({
        segmentID: "sample-segment-1",
        videoID: "sample-video-1",
        userID: TEST_USER_ID,
        name: "Open stance wave",
        description: null,
        startMilliseconds: 10000,
        endMilliseconds: 20000,
        tags: ["wave"],
        difficulty: "medium",
        confidence: "low",
        practicePriority: "high",
        createdAt: new Date("2026-07-30T10:01:00.000Z"),
    });

    await persistenceProvider.segmentDataAccess.createSegment({
        segmentID: "sample-segment-2",
        videoID: "sample-video-1",
        userID: TEST_USER_ID,
        name: "Closed stance wave",
        description: null,
        startMilliseconds: 30000,
        endMilliseconds: 40000,
        tags: ["wave"],
        difficulty: "hard",
        confidence: "medium",
        practicePriority: "medium",
        createdAt: new Date("2026-07-30T10:02:00.000Z"),
    });

    await persistenceProvider.segmentDataAccess.createSegment({
        segmentID: "sample-segment-3",
        videoID: "sample-video-1",
        userID: TEST_USER_ID,
        name: "Basic step",
        description: null,
        startMilliseconds: 50000,
        endMilliseconds: 60000,
        tags: ["basic"],
        difficulty: "easy",
        confidence: "high",
        practicePriority: "low",
        createdAt: new Date("2026-07-30T10:03:00.000Z"),
    });
}

type CreateOtherUserDynamoDBTestDataInput = {
    persistenceProvider: PersistenceProvider;
};

export async function createOtherUserDynamoDBTestData({
    persistenceProvider,
}: CreateOtherUserDynamoDBTestDataInput): Promise<void> {
    await persistenceProvider.videoDataAccess.createVideo({
        videoID: OTHER_TEST_VIDEO_ID,
        userID: OTHER_TEST_USER_ID,
        title: "Another user's lesson",
        storageKey: "test-videos/other-user-video.mp4",
        storageProvider: "minio",
        originalFileName: "other-user-video.mp4",
        status: "pending_upload",
        createdAt: new Date("2026-07-30T13:00:00.000Z"),
    });

    await persistenceProvider.videoDataAccess.updateVideoStatus({
        userID: OTHER_TEST_USER_ID,
        videoID: OTHER_TEST_VIDEO_ID,
        status: "ready",
    });

    await persistenceProvider.segmentDataAccess.createSegment({
        segmentID: OTHER_TEST_SEGMENT_ID,
        videoID: OTHER_TEST_VIDEO_ID,
        userID: OTHER_TEST_USER_ID,
        name: "Another user's weak segment",
        description: null,
        startMilliseconds: 10000,
        endMilliseconds: 20000,
        tags: ["other-user-test"],
        difficulty: "medium",
        confidence: "low",
        practicePriority: "high",
        createdAt: new Date("2026-07-30T13:01:00.000Z"),
    });
}

export function createDynamoDBTestPersistenceProvider(): PersistenceProvider {
    const connection = createDynamoDBConnection();

    return {
        videoDataAccess: createDynamoDBVideoDataAccess(connection),
        segmentDataAccess: createDynamoDBSegmentDataAccess(connection),

        async close() {
            connection.close();
        },
    };
}

export async function clearDynamoDBTestDatabase(): Promise<void> {
    assertSafeDynamoDBTestTarget({
        endpoint: process.env.DYNAMODB_ENDPOINT,
        tableName: process.env.DYNAMODB_TABLE_NAME,
    });

    const connection = createDynamoDBConnection();
    let exclusiveStartKey:
        | Record<string, string>
        | undefined;

    try {
        do {
            const result = await connection.documentClient.send(
                new ScanCommand({
                    TableName: connection.tableName,
                    ProjectionExpression: "PK, SK",
                    ExclusiveStartKey: exclusiveStartKey,
                })
            );

            await Promise.all(
                (result.Items ?? []).map((item) => {
                    if (
                        typeof item.PK !== "string" ||
                        typeof item.SK !== "string"
                    ) {
                        throw new Error(
                            "DynamoDB test item is missing PK or SK"
                        );
                    }

                    return connection.documentClient.send(
                        new DeleteCommand({
                            TableName: connection.tableName,
                            Key: {
                                PK: item.PK,
                                SK: item.SK,
                            },
                        })
                    );
                })
            );

            exclusiveStartKey = result.LastEvaluatedKey as
                | Record<string, string>
                | undefined;
        } while (exclusiveStartKey);
    } finally {
        connection.close();
    }
}
