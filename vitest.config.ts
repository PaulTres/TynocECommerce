import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/..." path alias from tsconfig so tests can import like the app does.
export default defineConfig({
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
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
