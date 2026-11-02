import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors the "@/..." path alias from tsconfig so tests can import like the app does.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node" },
});
