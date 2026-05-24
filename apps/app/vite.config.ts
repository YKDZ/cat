import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { telefunc } from "telefunc/vite";
import vike from "vike/plugin";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig({
  ssr: {
    external: ["@cat/agent", "@cat/plugin-core", "@cat/permissions", "@cat/db"],
  },

  optimizeDeps: {
    include: ["@cat/ui"],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  server: {
    watch: {
      ignored: ["plugins/**"],
    },
  },

  plugins: [
    // @vueuse/core 14.x dist/index.js contains 2 invalid /* #__PURE__ */ annotations
    // (with '#' instead of '@') placed in syntactically wrong positions that Rolldown
    // rejects. Remove them; the correct /* @__PURE__ */ counterparts (57 of them) still
    // handle tree-shaking correctly. Track: https://github.com/vueuse/vueuse/issues
    {
      name: "vite:fix-vueuse-pure-annotations",
      transform: (code: string, id: string) => {
        if (!id.includes("@vueuse/core")) return null;
        return { code: code.replace(/\/\* #__PURE__ \*\/ ?/g, ""), map: null };
      },
    },
    telefunc(),
    vike(),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    tailwindcss(),
    vueDevTools(),
  ],

  build: {
    target: "esnext",
    emptyOutDir: true,
    rollupOptions: {
      external: ["@cat/agent", "@cat/permissions", "@cat/db"],
    },
  },
});
