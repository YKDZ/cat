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
      name: "shared",
      fileName: (format) => `index.${format}` + (format === "es" ? ".js" : ""),
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    rollupOptions: {
      external: [
        "path",
        "fs",
        "vm",
        "module",
        "fs/promises",
        "url",
        "zod",
        "crypto",
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
