import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    deps: {
      moduleDirectories: ["../../packages"],
    },
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});
