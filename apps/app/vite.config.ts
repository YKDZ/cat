import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import UnoCSS from "unocss/vite";
import vike from "vike/plugin";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    noExternal: ["vue-i18n"],
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
    // @ts-expect-error UnoCSS Plugin types are not compatible with Vite 7 yet
    UnoCSS(),
    vike(),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
  ],
  build: {
    target: "es2022",
    emptyOutDir: true,
  },
});
