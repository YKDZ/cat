import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import vike from "vike/plugin";
import { defineConfig } from "vite";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import vueDevTools from "vite-plugin-vue-devtools";
import tailwindcss from "@tailwindcss/vite";

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
    tailwindcss(),
    vike(),
    VueI18nPlugin({
      ssr: true,
      include: [resolve(import.meta.dirname, "./locales/**")],
    }),
    // @ts-expect-error tailwind error
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
