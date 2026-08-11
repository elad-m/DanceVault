import { buildApp } from "./app";
import { runtime } from "./runtime";
import {
    getActiveVideoStorageProviderName,
    getMinioVideoStorageEndpoint,
} from "./storage";

async function start() {
    const app = buildApp();
    const videoStorageProviderName =
        getActiveVideoStorageProviderName();

    app.log.info(
        {
            environment: runtime.environment,
            videoStorageProviderName,
            videoStorageEndpoint:
                videoStorageProviderName === "minio"
                    ? getMinioVideoStorageEndpoint()
                    : undefined,
        },
        "Storage configuration"
    );

    await app.listen({ port: 3000 });
}

start();
