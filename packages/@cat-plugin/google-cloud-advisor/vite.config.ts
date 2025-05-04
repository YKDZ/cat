import { defineConfig } from "vite";
import path from "path";
import dts from "vite-plugin-dts";
import { builtinModules } from "node:module";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
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
      tsconfigPath: path.resolve(__dirname, "tsconfig.json"),
    }),
  ],
});
