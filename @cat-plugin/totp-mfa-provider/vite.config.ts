import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type EnvironmentOptions } from "vite";

const components = {
  "user-verify-totp": "src/components/UserVerifyTotp.ts",
  "user-init-totp": "src/components/UserInitTotp.ts",
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
          name: name.replace(/-/g, "_"),
          formats: ["iife"],
          fileName: () => `${name}.js`,
        },
        rolldownOptions: {
          external: ["vue"],
          output: {
            globals: {
              vue: "Vue",
            },
          },
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
        rolldownOptions: {
          external: ["hono", "zod", "@cat/plugin-core"],
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
      const serverEnvironment = builder.environments["server"];
      if (serverEnvironment === undefined) {
        throw new Error("Missing server build environment");
      }
      await builder.build(serverEnvironment);

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
