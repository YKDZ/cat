import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      external: [
        "@cat/shared",
        "@prisma/client",
        "@aws-sdk/s3-request-presigner",
        "@aws-sdk/client-s3",
        "@elastic/elasticsearch",
        "@prisma/client/runtime/library",
        "@prisma/adapter-pg",
        "@prisma/client/runtime/client",
        "@prisma/client/runtime/query_compiler_bg.postgresql.mjs",
        "dotenv/config",
        "redis",
        "node:fs/promises",
        "node:module",
        "node:process",
        "node:path",
        "node:url",
        "node:crypto",
        "node:buffer",
      ],
    },
    target: "esnext",
  },
  plugins: [
    dts({
      outDir: "dist/types",
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
      insertTypesEntry: true,
    }),
  ],
});
