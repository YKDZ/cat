import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/db",
      "@cat/domain",
      "@cat/shared",
      "zod",
      "vue",
      "dompurify",
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
    minify: false,
    rolldownOptions: {
      external: [
        "@cat/db",
        "@cat/domain",
        "@cat/shared",
        "zod",
        "vue",
        "dompurify",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, "src"),
      },
    },

    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        client: resolve(import.meta.dirname, "src/client/index.ts"),
        "term-services": resolve(
          import.meta.dirname,
          "src/services/term-services.ts",
        ),
      },
      formats: ["es"],
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
