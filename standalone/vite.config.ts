import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const wsPort = Number(process.env.ACP_WS_PORT ?? 5174);
const vitePort = Number(process.env.ACP_UI_VITE_PORT ?? 5173);

export default defineConfig({
    plugins: [react()],
    root: dir,
    server: {
        port: vitePort,
        strictPort: true,
        proxy: {
            "/__acp_ui_ws": {
                target: `ws://127.0.0.1:${wsPort}`,
                ws: true,
                rewrite: () => "/",
            },
        },
    },
});
