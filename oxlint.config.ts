import { defineConfig } from "oxlint";

const clientForbiddenImports = [
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
  "node:",
];

export default defineConfig({
  plugins: ["eslint", "oxc", "typescript", "import", "node", "promise", "vue"],
  jsPlugins: ["./tooling/oxlint/cat-plugin.ts"],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  env: {
    builtin: true,
  },
  options: {
    typeAware: true,
  },
  ignorePatterns: [
    "**/dist/**",
    "**/coverage/**",
    "**/*.js",
    "**/*.cjs",
    "**/*.mjs",
    "!scripts/**/*.js",
  ],
  rules: {
    "promise/catch-or-return": "error",
    "promise/spec-only": "error",
    "typescript/no-misused-promises": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-deprecated": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-unsafe-call": "warn",
    "typescript/no-unsafe-argument": "warn",
    "typescript/no-unsafe-assignment": "warn",
    "typescript/no-unsafe-member-access": "warn",
    "typescript/no-unsafe-return": "warn",
    "typescript/no-unsafe-type-assertion": "warn",
    "typescript/no-unsafe-enum-comparison": "warn",
    "typescript/no-unsafe-unary-minus": "warn",
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      env: { builtin: true, node: true },
    },
    {
      files: [
        "apps/app/**/*.vue",
        "apps/app/**/*.client.ts",
        "apps/app/src/stores/**/*.ts",
        "apps/app/src/pages/**/+onHydrationEnd.ts",
        "apps/app/src/pages/**/+onPageTransitionStart.ts",
        "apps/app/src/pages/**/+onPageTransitionEnd.ts",
        "apps/app/src/pages/**/+onCreatePageContext.ts",
        "apps/app/src/pages/**/+onCreateGlobalContext.ts",
        "apps/app/src/pages/**/+onData.ts",
        "apps/app/src/pages/**/+onHookCall.ts",
        "apps/app/src/pages/**/+onCreateApp.ts",
        "apps/app/src/pages/**/+onRenderClient.ts",
        "apps/app/src/pages/**/+onBeforeRoute.ts",
        "apps/app/src/pages/**/+onBeforeRenderClient.ts",
        "apps/app/src/pages/**/+onBeforeRender.ts",
        "apps/app/src/pages/**/+guard.ts",
        "apps/app/src/pages/**/+data.ts",
        "packages/ui/**/*.vue",
        "packages/plugin-core/src/client/**/*.ts",
        "@cat-plugin/tiny-widget/src/**/*.{ts,vue}",
      ],
      env: {
        browser: true,
        node: false,
        "shared-node-browser": true,
      },
      rules: {
        "cat/no-server-import": [
          "error",
          {
            forbidden: clientForbiddenImports,
            allowed: ["@cat/plugin-core/client"],
            allowTypeImports: true,
          },
        ],
      },
    },
    {
      files: ["**/*.vue"],
      rules: {
        "vue/no-export-in-script-setup": "error",
        "vue/prefer-import-from-vue": "error",
        "vue/valid-define-emits": "error",
        "vue/valid-define-props": "error",
        "vue/no-import-compiler-macros": "error",
        "vue/no-multiple-slot-args": "error",
      },
    },
    {
      files: ["**/*.{spec,test}.{ts,tsx,vue}"],
      rules: {
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-explicit-any": "off",
      },
    },
    {
      files: [
        "apps/cli/**/*.ts",
        "apps/eval/**/*.ts",
        "tools/**/*.ts",
        "scripts/**/*.ts",
      ],
      rules: {
        "eslint/no-console": "off",
      },
    },
    {
      files: ["apps/app/scripts/**/*.ts"],
      rules: {
        "cat/no-server-import": "off",
      },
    },
  ],
});
