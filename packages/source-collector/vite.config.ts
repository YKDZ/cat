import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@vue/compiler-sfc",
      "@vue/compiler-dom",
      "ts-morph",
      "glob",
      "zod",
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
        extractor: resolve(import.meta.dirname, "src/extractor.ts"),
        cli: resolve(import.meta.dirname, "src/cli.ts"),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, "src"),
      },
    },
  },
  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
