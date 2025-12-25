import { resolve } from "node:path";
import { defineConfig, type EnvironmentOptions } from "vite";
import vue from "@vitejs/plugin-vue";

const components = {
  "daily-quote-widget": "src/components/DailyQuoteWidget.ts",
};

const componentEnvironments = Object.fromEntries(
  Object.entries(components).map(([name, entry]) => [
    name.replace(/-/g, "_"),
    {
      consumer: "client",
      build: {
        ssr: false,
        emptyOutDir: false,
        lib: {
          entry,
          formats: ["es"],
          fileName: () => `${name}.js`,
        },
        rollupOptions: {
          external: ["vue"],
        },
      },
    } satisfies EnvironmentOptions,
  ]),
);

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  environments: {
    server: {
      build: {
        ssr: true,
        emptyOutDir: true,
        lib: {
          entry: "src/index.ts",
          formats: ["es"],
        },
        rollupOptions: {
          external: ["@cat/plugin-core"],
        },
      },
    },
    ...componentEnvironments,
  },

  builder: {
    buildApp: async (builder) => {
      const environments = Object.entries(builder.environments)
        .filter(([key]) =>
          Object.keys(components)
            .map((name) => name.replace(/-/g, "_"))
            .includes(key),
        )
        .map(([, environment]) => environment);

      // Let server build empty the output dir for the rest of building at first
      await builder.build(builder.environments["server"]);

      await Promise.all(
        environments.map(async (environment) => builder.build(environment)),
      );
    },
  },

  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (name) => name.toLowerCase().endsWith("ce"),
        },
      },
    }),
  ],
});
