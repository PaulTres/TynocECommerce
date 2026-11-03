import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/..." path alias from tsconfig so tests can import like the app does.
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            // `server-only` is a build-time boundary marker; backend tests run in Node.
            "server-only": path.resolve(__dirname, "tests/server-only.ts"),
        },
    },
    test: {
        environment: "node",
        globals: true,
        clearMocks: true,
        restoreMocks: true,

        server: {
            deps: {
                inline: ["next-auth"],
            },
        },
    },
});
