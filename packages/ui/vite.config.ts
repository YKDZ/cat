import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [vue(), tailwindcss()],

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
        /^@vue-flow\//,
        "elkjs",
        "elkjs/lib/elk.bundled.js",
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
