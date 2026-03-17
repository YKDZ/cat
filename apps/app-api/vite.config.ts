import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/app-agent",
      "@cat/app-agent/workflow",
      "@cat/domain",
      "@cat/db",
      "@cat/shared",
      "@cat/plugin-core",
      "@cat/server-shared",
      "@cat/operations",
      "@orpc/client",
      "@orpc/server",
      "@orpc/experimental-pino",
      "vike",
      "zod",
      "telefunc",
      "hono",
      "pino",
      "devalue",
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
    rolldownOptions: {
      external: [
        "@cat/app-agent",
        "@cat/app-agent/workflow",
        "@cat/domain",
        "@cat/db",
        "@cat/operations",
        "@cat/shared",
        "@cat/plugin-core",
        "@cat/server-shared",
        "@orpc/client",
        "@orpc/server",
        "@orpc/experimental-pino",
        "vike",
        "zod",
        "telefunc",
        "hono",
        "pino",
        "devalue",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, "src"),
      },
    },

    lib: {
      entry: {
        app: resolve(import.meta.dirname, "src/app.ts"),
        context: resolve(import.meta.dirname, "src/utils/context.ts"),
        "orpc/router": resolve(import.meta.dirname, "src/orpc/router.ts"),
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
