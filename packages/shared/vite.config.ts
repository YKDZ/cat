import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";

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
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        utils: resolve(import.meta.dirname, "src/utils/index.ts"),
        "schema/json": resolve(import.meta.dirname, "src/schema/json.ts"),
        "schema/misc": resolve(import.meta.dirname, "src/schema/misc.ts"),
        "schema/plugin": resolve(import.meta.dirname, "src/schema/plugin.ts"),
        "schema/prisma/document": resolve(
          import.meta.dirname,
          "src/schema/prisma/document.ts",
        ),
        "schema/prisma/file": resolve(
          import.meta.dirname,
          "src/schema/prisma/file.ts",
        ),
        "schema/prisma/glossary": resolve(
          import.meta.dirname,
          "src/schema/prisma/glossary.ts",
        ),
        "schema/prisma/memory": resolve(
          import.meta.dirname,
          "src/schema/prisma/memory.ts",
        ),
        "schema/prisma/misc": resolve(
          import.meta.dirname,
          "src/schema/prisma/misc.ts",
        ),
        "schema/prisma/plugin": resolve(
          import.meta.dirname,
          "src/schema/prisma/plugin.ts",
        ),
        "schema/prisma/project": resolve(
          import.meta.dirname,
          "src/schema/prisma/project.ts",
        ),
        "schema/prisma/role": resolve(
          import.meta.dirname,
          "src/schema/prisma/role.ts",
        ),
        "schema/prisma/translation": resolve(
          import.meta.dirname,
          "src/schema/prisma/translation.ts",
        ),
        "schema/prisma/user": resolve(
          import.meta.dirname,
          "src/schema/prisma/user.ts",
        ),
        "schema/prisma/vector": resolve(
          import.meta.dirname,
          "src/schema/prisma/vector.ts",
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
