import type { FastifyInstance } from "fastify";

export const TEST_USER_ID = "test-user-1";
export const OTHER_TEST_USER_ID = "test-user-2";
export const OTHER_TEST_VIDEO_ID = "other-user-video";
export const OTHER_TEST_SEGMENT_ID = "other-user-segment";

export function registerTestAuthentication(app: FastifyInstance) {
    app.addHook("onRequest", async (request) => {
        request.headers["x-user-id"] = TEST_USER_ID;
    });
}
