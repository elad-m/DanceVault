import { buildApp } from "./app";

async function start() {
    const app = buildApp();

    await app.listen({ port: 3000 });
}

start();
