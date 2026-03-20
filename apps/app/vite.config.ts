import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { telefunc } from "telefunc/vite";
import vike from "vike/plugin";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig({
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
    telefunc(),
    vike(),
    VueI18nPlugin({
      ssr: true,
      include: [resolve(import.meta.dirname, "./locales/**")],
    }),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    tailwindcss(),
    vueDevTools(),
  ],

  build: {
    target: "esnext",
    emptyOutDir: true,
  },
});
