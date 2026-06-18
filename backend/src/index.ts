import { app } from "./app";

async function start() {
    await app.listen({ port: 3000 });
}

start();
