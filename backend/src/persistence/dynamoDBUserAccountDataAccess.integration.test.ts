import { randomUUID } from "node:crypto";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { afterAll, describe, expect, it } from "vitest";
import { createDynamoDBConnection } from "./dynamoDBConnection";
import { createUserAccountPrimaryKey } from "./dynamoDBKeys";
import { createDynamoDBUserAccountDataAccess } from "./dynamoDBUserAccountDataAccess";
import { currentLegalPolicyVersions } from "../domain/legalAcceptance";

const connection = createDynamoDBConnection();
const userAccountDataAccess =
    createDynamoDBUserAccountDataAccess(connection);

describe("DynamoDB user account data access integration", () => {
    afterAll(() => {
        connection.close();
    });

    it("stores current legal acceptance only for an active account", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const acceptedAt = new Date("2026-09-15T12:00:00.000Z");

        try {
            await expect(
                userAccountDataAccess.getUserLegalAcceptance({ userID })
            ).resolves.toBeNull();

            const acceptance =
                await userAccountDataAccess.acceptLegalPolicies({
                    userID,
                    versions: currentLegalPolicyVersions,
                    acceptedAt,
                });

            expect(acceptance).toEqual({
                ...currentLegalPolicyVersions,
                acceptedAt: acceptedAt.toISOString(),
            });
            await expect(
                userAccountDataAccess.getUserLegalAcceptance({ userID })
            ).resolves.toEqual(acceptance);

            await userAccountDataAccess.startUserAccountDeletion({
                userID,
                requestedAt: new Date("2026-09-15T13:00:00.000Z"),
            });

            await expect(
                userAccountDataAccess.acceptLegalPolicies({
                    userID,
                    versions: currentLegalPolicyVersions,
                    acceptedAt: new Date("2026-09-15T14:00:00.000Z"),
                })
            ).rejects.toThrow();
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: createUserAccountPrimaryKey(userID),
                })
            );
        }
    });

    it("creates one deleting marker and preserves its first request time", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const firstRequest = new Date(
            "2026-09-10T12:00:00.000Z"
        );

        try {
            await expect(
                userAccountDataAccess.getUserAccountLifecycle({
                    userID,
                })
            ).resolves.toBeNull();

            const firstResult =
                await userAccountDataAccess.startUserAccountDeletion({
                    userID,
                    requestedAt: firstRequest,
                });
            const repeatedRequests = await Promise.all([
                userAccountDataAccess.startUserAccountDeletion({
                    userID,
                    requestedAt: new Date(
                        "2026-09-10T13:00:00.000Z"
                    ),
                }),
                userAccountDataAccess.startUserAccountDeletion({
                    userID,
                    requestedAt: new Date(
                        "2026-09-10T14:00:00.000Z"
                    ),
                }),
            ]);

            expect(firstResult).toEqual({
                status: "deleting",
                deletionRequestedAt: firstRequest.toISOString(),
            });
            expect(repeatedRequests).toEqual([
                firstResult,
                firstResult,
            ]);
            await expect(
                userAccountDataAccess.getUserAccountLifecycle({
                    userID,
                })
            ).resolves.toEqual(firstResult);
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: createUserAccountPrimaryKey(userID),
                })
            );
        }
    });

    it("rejects a conflicting item instead of replacing it", async () => {
        const userID = `integration-user-${randomUUID()}`;
        const key = createUserAccountPrimaryKey(userID);

        try {
            await connection.documentClient.send(
                new PutCommand({
                    TableName: connection.tableName,
                    Item: {
                        ...key,
                        entityType: "unexpected",
                    },
                })
            );

            await expect(
                userAccountDataAccess.startUserAccountDeletion({
                    userID,
                    requestedAt: new Date(),
                })
            ).rejects.toThrow();
        } finally {
            await connection.documentClient.send(
                new DeleteCommand({
                    TableName: connection.tableName,
                    Key: key,
                })
            );
        }
    });
});
