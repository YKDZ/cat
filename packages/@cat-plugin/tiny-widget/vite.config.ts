import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith("tiny-"),
        },
      },
    }),
  ],

  build: {
    lib: {
      entry: {
        "daily-quote-widget": "src/components/DailyQuoteWidget.ts",
        index: "src/index.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["vue"],
    },
  },
});
