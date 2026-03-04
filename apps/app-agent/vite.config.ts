import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/plugin-core",
      "@cat/shared",
      "@cat/app-server-shared",
      "zod",
      "zod/v4",
      "zod/v4/core",
    ],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [
    dts({
      include: ["src/**/*.ts"],
      compilerOptions: {
        declarationMap: true,
      },
    }),
  ],

  build: {
    ssr: true,
    target: "esnext",
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
      },
      formats: ["es"],
    },
    sourcemap: true,
  },
});
