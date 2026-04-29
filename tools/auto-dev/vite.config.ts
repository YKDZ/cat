import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  ssr: {
    // Bundle all deps into the output so they're available without node_modules at runtime
    noExternal: true,
  },

  build: {
    ssr: true,
    emptyOutDir: true,
    sourcemap: true,

    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        cli: resolve(import.meta.dirname, "src/cli.ts"),
        "scripts/get-installation-token": resolve(
          import.meta.dirname,
          "src/scripts/get-installation-token.ts",
        ),
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
