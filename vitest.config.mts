import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: process.env.INTEGRATION ? ["tests/**/*.test.ts"] : ["src/**/*.test.ts"],
    testTimeout: 20000,
  },
});
