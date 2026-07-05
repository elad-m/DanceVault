import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
    "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
    },
};

export default defineConfig({
    plugins: [react()],
    server: {
        host: "0.0.0.0",
        proxy: apiProxy,
    },
    preview: {
        host: "0.0.0.0",
        proxy: apiProxy,
    },
});
