import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

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
        "schema/agent": resolve(import.meta.dirname, "src/schema/agent.ts"),
        "schema/misc": resolve(import.meta.dirname, "src/schema/misc.ts"),
        "schema/plugin": resolve(import.meta.dirname, "src/schema/plugin.ts"),
        "schema/ce": resolve(import.meta.dirname, "src/schema/ce.ts"),
        "schema/drizzle/document": resolve(
          import.meta.dirname,
          "src/schema/drizzle/document.ts",
        ),
        "schema/drizzle/file": resolve(
          import.meta.dirname,
          "src/schema/drizzle/file.ts",
        ),
        "schema/drizzle/qa": resolve(
          import.meta.dirname,
          "src/schema/drizzle/qa.ts",
        ),
        "schema/drizzle/glossary": resolve(
          import.meta.dirname,
          "src/schema/drizzle/glossary.ts",
        ),
        "schema/drizzle/agent": resolve(
          import.meta.dirname,
          "src/schema/drizzle/agent.ts",
        ),
        "schema/drizzle/memory": resolve(
          import.meta.dirname,
          "src/schema/drizzle/memory.ts",
        ),
        "schema/drizzle/misc": resolve(
          import.meta.dirname,
          "src/schema/drizzle/misc.ts",
        ),
        "schema/drizzle/plugin": resolve(
          import.meta.dirname,
          "src/schema/drizzle/plugin.ts",
        ),
        "schema/drizzle/project": resolve(
          import.meta.dirname,
          "src/schema/drizzle/project.ts",
        ),
        "schema/drizzle/translation": resolve(
          import.meta.dirname,
          "src/schema/drizzle/translation.ts",
        ),
        "schema/drizzle/user": resolve(
          import.meta.dirname,
          "src/schema/drizzle/user.ts",
        ),
        "schema/drizzle/vector": resolve(
          import.meta.dirname,
          "src/schema/drizzle/vector.ts",
        ),
        "schema/drizzle/enum": resolve(
          import.meta.dirname,
          "src/schema/drizzle/enum.ts",
        ),
        "schema/drizzle/comment": resolve(
          import.meta.dirname,
          "src/schema/drizzle/comment.ts",
        ),
        "schema/nlp": resolve(import.meta.dirname, "src/schema/nlp.ts"),
        "schema/permission": resolve(
          import.meta.dirname,
          "src/schema/permission.ts",
        ),
        "schema/term-recall": resolve(
          import.meta.dirname,
          "src/schema/term-recall.ts",
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
