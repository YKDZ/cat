import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    ssr: true,
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      fileName: (format) => `index.${format}` + (format === "es" ? ".js" : ""),
      formats: ["es", "cjs"],
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
      ],
    },
    target: "esnext",
  },
  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
