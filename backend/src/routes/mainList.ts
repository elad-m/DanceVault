import type { FastifyInstance } from "fastify";
import type { PersistenceProvider } from "../persistence/persistenceProvider";
import { MAX_MAIN_LIST_SEGMENTS } from "../persistence/mainListDataAccess";

export function registerMainListRoutes(
    app: FastifyInstance,
    persistence: PersistenceProvider
) {
    app.get("/main-list", async (request) => {
        const list = await persistence.mainListDataAccess.getMainList({ userID: request.userId });
        const segments = await persistence.segmentDataAccess.listSegments({ userID: request.userId });
        const byID = new Map(segments.map(segment => [segment.id, segment]));
        // Deleted segments disappear from the response without racing a concurrent reorder.
        const visible = list.segmentIDs.flatMap(id => {
            const segment = byID.get(id);
            return segment ? [segment] : [];
        });
        return { version: list.version, segmentIDs: visible.map(segment => segment.id), segments: visible };
    });

    app.put<{ Body: { segmentIDs: string[]; expectedVersion: number } }>("/main-list", {
        schema: { body: {
            type: "object", additionalProperties: false,
            required: ["segmentIDs", "expectedVersion"],
            properties: {
                segmentIDs: { type: "array", maxItems: MAX_MAIN_LIST_SEGMENTS, uniqueItems: true,
                    items: { type: "string", minLength: 1, maxLength: 128 } },
                expectedVersion: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
            },
        } },
    }, async (request, reply) => {
        const segments = await persistence.segmentDataAccess.listSegments({ userID: request.userId });
        const ownedIDs = new Set(segments.map(segment => segment.id));
        if (request.body.segmentIDs.some(id => !ownedIDs.has(id))) {
            return reply.code(400).send({ error: { code: "INVALID_MAIN_LIST_SEGMENT",
                message: "Every Main List segment must exist and belong to you" } });
        }
        const result = await persistence.mainListDataAccess.saveMainList({
            userID: request.userId, ...request.body,
        });
        if (!result) {
            return reply.code(409).send({ error: { code: "MAIN_LIST_CONFLICT",
                message: "Main List changed on another device. Refresh and try again" } });
        }
        return result;
    });
}
