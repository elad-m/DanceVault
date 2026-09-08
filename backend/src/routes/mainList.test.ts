import Fastify from "fastify";
import { beforeEach, afterAll, it, expect } from "vitest";
import { registerMainListRoutes } from "./mainList";
import { createDynamoDBTestPersistenceProvider, resetDynamoDBTestDatabase,
    clearDynamoDBTestDatabase } from "../test/dynamoDBTestDatabase";
import { TEST_USER_ID } from "../test/routeTestSupport";

const persistence = createDynamoDBTestPersistenceProvider();
const app = Fastify();
app.addHook("onRequest", async request => { request.userId = TEST_USER_ID; });
registerMainListRoutes(app, persistence);
beforeEach(async () => resetDynamoDBTestDatabase({ persistenceProvider: persistence }));
afterAll(async () => { await app.close(); await clearDynamoDBTestDatabase(); await persistence.close(); });

it("creates, reorders and clears a list while preserving the segments", async () => {
    expect((await app.inject("/main-list")).json()).toEqual({ version: 0, segmentIDs: [], segments: [] });
    for (const [index, segmentIDs] of [["sample-segment-1", "sample-segment-2"],
        ["sample-segment-2", "sample-segment-1"], []].entries()) {
        const response = await app.inject({ method: "PUT", url: "/main-list",
            payload: { segmentIDs, expectedVersion: index } });
        expect(response.statusCode).toBe(200);
        const read = (await app.inject("/main-list")).json();
        expect(read.segmentIDs).toEqual(segmentIDs);
        expect(read.version).toBe(index + 1);
    }
    expect(await persistence.segmentDataAccess.getSegmentByID({ userID: TEST_USER_ID,
        segmentID: "sample-segment-1" })).not.toBeNull();
});

it("accepts only one concurrent save and keeps users isolated", async () => {
    const save = () => app.inject({ method: "PUT", url: "/main-list",
        payload: { segmentIDs: ["sample-segment-1"], expectedVersion: 0 } });
    const responses = await Promise.all([save(), save()]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409]);
    expect(await persistence.mainListDataAccess.getMainList({ userID: "another-user" }))
        .toEqual({ segmentIDs: [], version: 0 });
});

it("rejects unknown segments, duplicates and oversized lists", async () => {
    for (const segmentIDs of [["other-users-segment"], ["sample-segment-1", "sample-segment-1"],
        Array.from({ length: 501 }, (_, index) => String(index))]) {
        expect((await app.inject({ method: "PUT", url: "/main-list",
            payload: { segmentIDs, expectedVersion: 0 } })).statusCode).toBe(400);
    }
});
