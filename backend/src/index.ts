import { buildApp } from "./app";

async function start() {
    const app = buildApp();

    app.log.info(
        {
            s3Provider: process.env.S3_PROVIDER,
            s3Bucket: process.env.S3_BUCKET,
        },
        "Storage configuration"
    );

    await app.listen({ port: 3000 });
}

start();
