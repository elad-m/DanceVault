import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

const app = buildApp();

afterAll(async () => {
    await app.close();
});

// Public routes

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

// Authentication

describe("Authentication", () => {
    it("rejects protected requests without a user identity", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/videos",
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
            error: {
                code: "UNAUTHORIZED",
                message: "Authentication is required",
            },
        });
    });
});
