import Fastify from "fastify";
import { registerSegmentRoutes } from "./routes/segments";
import { registerVideoRoutes } from "./routes/videos";

export function buildApp() {
    const app = Fastify({
        logger: true,
        ajv: {
            customOptions: {
                coerceTypes: false,
                removeAdditional: false,
            },
        },
    });

    app.get("/health", async () => {
        return { status: "ok" };
    });

    registerVideoRoutes(app);
    registerSegmentRoutes(app);

    return app;
}
