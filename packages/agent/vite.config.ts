import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/domain",
      "@cat/plugin-core",
      "@cat/shared",
      "@cat/server-shared",
      "@cat/operations",
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
        "workflow/index": resolve(import.meta.dirname, "src/workflow/index.ts"),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, "src"),
      },
    },
    sourcemap: true,
  },
});
