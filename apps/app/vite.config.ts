import md from "unplugin-vue-markdown/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import UnoCSS from "unocss/vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    watch: {
      ignored: ["**/.history/**", "plugins/**"],
    },
  },
  plugins: [
    UnoCSS(),
    !process.env.VITEST && vike(),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    md({}),
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      external: ["cloudflare:sockets", /\.prisma\/client\/.*$/],
    },
  },
});
