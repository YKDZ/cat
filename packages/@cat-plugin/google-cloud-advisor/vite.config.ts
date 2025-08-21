import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import { builtinModules } from "node:module";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["cjs"],
      fileName: () => `index.cjs`,
    },

    outDir: "dist",

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
      outDir: "dist",
      tsconfigPath: resolve(__dirname, "tsconfig.json"),
    }),
  ],
});
