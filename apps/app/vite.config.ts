import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { telefunc } from "telefunc/vite";
import vike from "vike/plugin";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";

import { pluginDistReload } from "./src/config/plugin-dist-reload.ts";
import {
  serverExternalPackages,
  serverPluginNoExternal,
  serverWorkspaceNoExternal,
} from "./src/config/server-packages.ts";

export default defineConfig({
  ssr: {
    external: [...serverExternalPackages],
    // vue-i18n and @intlify/* reference compile-time constants like
    // __VUE_PROD_DEVTOOLS__ that must be replaced by Vite's `define` plugin.
    // Forcing them to be bundled (not externalized) ensures the replacements apply.
    noExternal: [
      "vue-i18n",
      /^@intlify\//,
      serverWorkspaceNoExternal,
      serverPluginNoExternal,
    ],
  },

  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },

  optimizeDeps: {
    include: ["@cat/ui"],
  },

  resolve: {
    alias: [
      {
        find: "@cat/plugin-core/client",
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-core/src/client/index.ts",
        ),
      },
      {
        find: "@cat/plugin-core",
        replacement: resolve(
          import.meta.dirname,
          "../../packages/plugin-core/src/index.ts",
        ),
      },
      {
        find: /^@cat-plugin\/([^/]+)$/,
        replacement: resolve(
          import.meta.dirname,
          "../../@cat-plugin/$1/src/index.ts",
        ),
      },
    ],
    conditions: ["source"],
  },

  server: {
    watch: {
      ignored: ["plugins/**"],
    },
  },

  plugins: [
    pluginDistReload(),
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
      external: [...serverExternalPackages],
    },
  },
});
