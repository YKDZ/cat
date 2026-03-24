import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/domain",
      "@cat/db",
      "@cat/shared",
      "@cat/plugin-core",
      "@cat/server-shared",
      "@cat/permissions",
      "zod",
      "zod/v4",
      "zod/v4/core",
      "diff",
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
      },
      formats: ["es"],
    },

    rolldownOptions: {
      external: [
        "@cat/domain",
        "@cat/db",
        "@cat/shared",
        "@cat/plugin-core",
        "@cat/server-shared",
        "@cat/permissions",
        "zod",
        "zod/v4",
        "zod/v4/core",
        "diff",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, "src"),
      },
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
