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
    rolldownOptions: {
      external: [
        "vue",
        "vee-validate",
        "zod",
        "reka-ui",
        "vue-sonner",
        "tailwindcss",
        "lucide-vue-next",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
        /^vike/,
        /^@vueuse\//,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, "src"),
        entryFileNames: "[name].js",
      },
    },
    sourcemap: true,
  },
});
