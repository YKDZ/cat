import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  ssr: {
    external: ["@cat/shared"],
    noExternal: ["@prisma/adapter-pg", "@prisma/client"],
  },
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
    target: "esnext",
  },
  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
