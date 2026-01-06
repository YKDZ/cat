import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/db",
      "@cat/shared",
      "@cat/plugin-core",
      "@cat/app-workers",
      "@cat/app-server-shared",
      "@orpc/client",
      "@orpc/server",
      "@orpc/experimental-pino",
      "vike",
      "zod",
      "telefunc",
      "hono",
      "pino",
      "lodash-es",
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
