import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import vike from "vike/plugin";
import { defineConfig } from "rolldown-vite";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
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
    UnoCSS(),
    vike(),
    VueI18nPlugin({
      ssr: true,
      include: [resolve(import.meta.dirname, "./locales/**")],
    }),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    vueDevTools(),
  ],
  build: {
    target: "esnext",
    emptyOutDir: true,
  },
});
