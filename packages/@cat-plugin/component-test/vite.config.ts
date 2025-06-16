import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import vue from "@vitejs/plugin-vue";
import { parse } from "vue/compiler-sfc";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

function replaceVueGlobal() {
  return {
    name: "replace-vue-global",
    enforce: "post" as "pre" | "post",

    transform(code, id) {
      // 扩展处理范围：包括 .vue、.js、.ts、.jsx、.tsx
      if (!/\.(vue|js|ts|jsx|tsx)$/.test(id)) return;
      if (id.includes("node_modules")) return; // 排除 node_modules

      const importRegex = /import\s*{([^}]+)}\s*from\s*['"]vue['"];?/g;

      // 处理 .vue 文件
      if (id.endsWith(".vue")) {
        const { descriptor } = parse(code, { sourceMap: false });
        const scriptBlock = descriptor.script || descriptor.scriptSetup;
        if (!scriptBlock) return;

        const newContent = scriptBlock.content.replace(
          importRegex,
          (_, imports) => {
            const transformedImports = imports.replace(/\s+as\s+/g, ": ");
            return `const { ${transformedImports} } = globalThis.vue;`;
          },
        );

        const start = scriptBlock.loc.start.offset;
        const end = scriptBlock.loc.end.offset;
        return {
          code: code.slice(0, start) + newContent + code.slice(end),
          map: null,
        };
      }
      // 处理其他 JS/TS 文件
      else {
        if (!importRegex.test(code)) return;
        const newCode = code.replace(importRegex, (_, imports) => {
          const transformedImports = imports.replace(/\s+as\s+/g, ": ");
          return `const { ${transformedImports} } = globalThis.vue;`;
        });
        return { code: newCode, map: null };
      }
    },
  };
}

export default defineConfig({
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

    outDir: "dist",

    rollupOptions: {
      output: {
        entryFileNames: "Test.mjs",
      },
    },
  },

  plugins: [
    replaceVueGlobal(),
    cssInjectedByJsPlugin(),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    dts({
      outDir: "dist",
      tsconfigPath: resolve(__dirname, "tsconfig.json"),
    }),
  ],
});
