import * as fs from "node:fs";
import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

/**
 * Walk src/compat/**\/*.ts and return an entry object suitable for
 * Vite's lib.entry, e.g.:
 *   { "compat/schema/json": "/abs/path/src/compat/schema/json.ts", ... }
 */
function collectCompatEntries(compatDir: string): Record<string, string> {
  const entries: Record<string, string> = {};

  function walk(dir: string): void {
    for (const name of fs.readdirSync(dir)) {
      const full = resolve(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".ts")) {
        // entry key: relative path from src/, without extension
        const rel = full
          .slice(resolve(import.meta.dirname, "src").length + 1)
          .replace(/\.ts$/, "");
        entries[rel] = full;
      }
    }
  }

  if (fs.existsSync(compatDir)) walk(compatDir);
  return entries;
}

const compatEntries = collectCompatEntries(
  resolve(import.meta.dirname, "src/compat"),
);

export default defineConfig({
  ssr: {
    external: ["pino", "zod"],
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
      entry: Object.assign(
        { index: resolve(import.meta.dirname, "src/index.ts") },
        compatEntries,
      ),
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
