import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/db",
      "@cat/plugin-core",
      "@cat/shared",
      "zod",
      "zod/v4",
      "zod/v4/core",
    ],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  build: {
    ssr: true,
    emptyOutDir: true,
    sourcemap: true,

    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        "capabilities/index": resolve(
          import.meta.dirname,
          "src/capabilities/index.ts",
        ),
        "events/index": resolve(import.meta.dirname, "src/events/index.ts"),
        "cache/index": resolve(import.meta.dirname, "src/cache/index.ts"),
      },
      formats: ["es"],
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
