import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    deps: {
      moduleDirectories: ["../../packages"],
    },
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
