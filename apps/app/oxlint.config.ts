import { defineConfig } from "oxlint";

import rootConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [rootConfig],

  jsPlugins: ["../../packages/oxlint-plugin/dist/index.js"],

  ignorePatterns: ["scripts/**"],

  plugins: ["vue"],

  categories: {
    correctness: "off",
  },

  env: {
    builtin: true,
    es2018: true,
    browser: true,
    "shared-node-browser": true,
  },

  rules: {
    "vue/no-export-in-script-setup": "error",
    "vue/prefer-import-from-vue": "error",
    "vue/valid-define-emits": "error",
    "vue/valid-define-props": "error",
    "vue/no-import-compiler-macros": "error",
    "vue/no-multiple-slot-args": "error",
    curly: "off",
    "no-unexpected-multiline": "off",
    "unicorn/empty-brace-spaces": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/number-literal-case": "off",
  },

  overrides: [
    {
      files: ["**/*.{test,spec}.{ts,tsx}"],
      rules: {
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-assignment": "off",
      },
    },

    {
      files: [
        "**/*.vue",
        "**/*.client.ts",
        "src/app/stores/**/*.ts",
        "**/+onHydrationEnd.ts",
        "**/+onPageTransitionStart.ts",
        "**/+onPageTransitionEnd.ts",
        "**/+onCreatePageContext.ts",
        "**/+onCreateGlobalContext.ts",
        "**/+onData.ts",
        "**/+onHookCall.ts",
        "**/+onCreateApp.ts",
        "**/+onRenderClient.ts",
        "**/+onBeforeRoute.ts",
        "**/+onBeforeRenderClient.ts",
        "**/+onBeforeRender.ts",
        "**/+guard.ts",
        "**/+data.ts",
      ],
      rules: {
        "cat/no-server-import": [
          "error",
          {
            forbidden: [
              "@cat/db",
              "@cat/domain",
              "@cat/operations",
              "@cat/server-shared",
              "@cat/plugin-core",
              "@photonjs/hono",
              "hono",
              "@hono/node-ws",
              "redis",
              "pg",
              "@orpc/server",
              "drizzle-orm",
              "telefunc",
              "node:fs",
              "node:path",
              "node:child_process",
              "node:net",
              "node:tls",
              "node:http",
              "node:http2",
              "node:https",
            ],
            allowed: ["@cat/plugin-core/client"],
            allowTypeImports: true,
          },
        ],
      },
    },

    {
      files: [
        "src/app/stores/agent.ts",
        "src/app/utils/provide.ts",
        "src/app/stores/editor/element.ts",
        "src/app/components/PluginConfigForm.vue",
        "src/app/pages/admin/permissions/+Page.vue",
      ],
      rules: {
        "cat/no-shared-subpath-import": "error",
      },
    },
  ],
});
