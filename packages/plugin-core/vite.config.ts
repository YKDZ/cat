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
      name: "plugin-core",
      fileName: (format) => `index.${format}` + (format === "es" ? ".js" : ""),
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    terserOptions: {
      format: {
        comments: /@vite-ignore/i,
      },
    },
    rollupOptions: {
      external: [
        "path",
        "fs",
        "vm",
        "module",
        "fs/promises",
        "url",
        "zod",
        "module",
        "@cat/shared",
        "@cat/db",
      ],
    },
  },
  plugins: [
    dts({
      outDir: "dist",
      tsconfigPath: path.resolve(__dirname, "tsconfig.json"),
    }),
  ],
});
