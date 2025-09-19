import { resolve } from "node:path";
import { defineConfig } from "rolldown-vite";
import dts from "unplugin-dts/vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/db",
      "@cat/shared",
      "@cat/plugin-core",
      "@cat/app-workers",
      "@cat/app-server-shared",
      "@trpc/client",
      "@trpc/server",
      "vike",
      "zod",
      "lodash-es",
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
        trpc: resolve(import.meta.dirname, "src/trpc/index.ts"),
        "trpc/client": resolve(import.meta.dirname, "src/trpc/client.ts"),
        "trpc/sscClient": resolve(import.meta.dirname, "src/trpc/sscClient.ts"),
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
