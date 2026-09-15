import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
