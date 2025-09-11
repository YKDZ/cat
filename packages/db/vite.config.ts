import { defineConfig } from "rolldown-vite";
import { resolve } from "path";
import dts from "unplugin-dts/vite";

export default defineConfig({
  ssr: {
    external: ["@cat/shared", "zod", "dotenv"],
    noExternal: ["@prisma/adapter-pg", "@prisma/client", "redis"],
  },

  build: {
    ssr: true,
    emptyOutDir: true,
    sourcemap: true,

    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      fileName: "index.js",
      formats: ["es"],
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
