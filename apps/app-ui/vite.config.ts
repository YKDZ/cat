import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [
    vue(),
    tailwindcss(),
    dts({
      include: ["src/**/*.ts", "src/**/*.vue"],
      compilerOptions: {
        declarationMap: true,
      },
    }),
  ],

  build: {
    target: "esnext",
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "Cat UI",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "vue",
        "vee-validate",
        "zod",
        "reka-ui",
        "vue-sonner",
        "tailwindcss",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    },
    sourcemap: true,
  },
});
