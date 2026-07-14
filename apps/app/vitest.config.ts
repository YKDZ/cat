import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    conditions: ["source"],
  },
  test: {
    environment: "happy-dom",
    include: [
      "scripts/**/*.spec.ts",
      "src/**/*.spec.ts",
      "src/**/*.test.ts",
      "src/components/plugin/plugin-component-artifacts.test.ts",
    ],
  },
});
