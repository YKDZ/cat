import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import { builtinModules } from "node:module";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["cjs"],
      fileName: () => `index.cjs`,
    },

    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      external: (id) => {
        const isNodeBuiltin =
          builtinModules.includes(id.replace(/^node:/, "")) ||
          id.startsWith("node:");

        return id.startsWith("@cat/") || isNodeBuiltin;
      },
      output: {
        entryFileNames: "[name].cjs",
      },
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.json"),
    }),
  ],
});
