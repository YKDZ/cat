import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  ssr: {
    external: ["@cat/shared", "@cat/db", "@cat/plugin-core"],
    noExternal: ["@elastic/elasticsearch"],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  build: {
    ssr: true,
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => `index.mjs`,
    },

    outDir: "dist",

    rollupOptions: {
      output: {
        entryFileNames: "[name].mjs",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
