import { defineConfig } from "vite";
import path from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => `index.mjs`,
    },

    outDir: "dist",

    rollupOptions: {
      external: ["@cat/plugin-core", "@cat/shared", "vue", "node:path"],
      output: {
        entryFileNames: "[name].mjs",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },

  plugins: [
    dts({
      outDir: "dist",
      tsconfigPath: path.resolve(__dirname, "tsconfig.json"),
    }),
  ],
});
