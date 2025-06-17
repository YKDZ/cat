import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import vue from "@vitejs/plugin-vue";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import type { Plugin, UserConfig } from "vite";

function globalizeVueImports(): Plugin {
  return {
    name: "vite:ssr-globalize-imports",
    apply: "build",
    enforce: "post",

    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!fileName.endsWith(".mjs") || chunk.type !== "chunk") continue;

        let code = chunk.code;
        let transformed = false;

        // 替换形如 import { a, b as c } from "vue"
        code = code.replace(
          /^import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"];?/gm,
          (_, importClause: string, source: string) => {
            const lines = importClause
              .split(",")
              .map((part) => {
                const [orig, alias] = part.trim().split(/\s+as\s+/);
                const original = orig.trim();
                const renamed = alias ? alias.trim() : original;
                return `const ${renamed} = globalThis["${source}"].${original};`;
              })
              .join("\n");

            transformed = true;
            return lines;
          },
        );

        if (transformed) {
          chunk.code = code;
        }
      }
    },
  };
}

export default defineConfig(
  ({ isSsrBuild }) =>
    ({
      resolve: {
        alias: {
          "@": resolve(__dirname, "src"),
        },
      },

      build: {
        lib: {
          entry: resolve(__dirname, "src/Test.vue"),
          formats: ["es"],
          name: "ComponentTest",
          fileName: () => `index.mjs`,
        },

        outDir: isSsrBuild ? "dist/ssr" : "dist/client",

        rollupOptions: {
          external: ["vue"],
          output: {
            entryFileNames: "Test.mjs",
          },
        },
      },

      plugins: [
        globalizeVueImports(),
        cssInjectedByJsPlugin(),
        vue({
          include: [/\.vue$/, /\.md$/],
        }),
        dts({
          outDir: "dist",
          tsconfigPath: resolve(__dirname, "tsconfig.json"),
        }),
      ],
    }) satisfies UserConfig,
);
