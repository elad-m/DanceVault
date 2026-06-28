import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

const app = buildApp();

afterAll(async () => {
    await app.close();
});

// Health route

describe("GET /health", () => {
    it("returns an ok status", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: "ok",
        });
    });
});
