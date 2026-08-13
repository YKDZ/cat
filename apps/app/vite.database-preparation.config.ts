import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "scripts/database-requirements.ts"),
      fileName: () => "database-requirements.mjs",
      formats: ["es"],
    },
    outDir: "dist/database-preparation",
  },
});
