import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import UnoCSS from "unocss/vite";
import vike from "vike/plugin";
import { defineConfig } from "vite";

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
    vike(),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      external: ["cloudflare:sockets", /\.prisma\/client\/.*$/],
    },
  },
});
