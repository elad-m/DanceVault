import { buildApp } from "./app";
import { runtime } from "./runtime";
import { getActiveVideoStorageProviderName } from "./storage";

async function start() {
    const app = buildApp();

    app.log.info(
        {
            environment: runtime.environment,
            videoStorageProviderName:
                getActiveVideoStorageProviderName(),
        },
        "Storage configuration"
    );

    await app.listen({ port: 3000 });
}

start();
