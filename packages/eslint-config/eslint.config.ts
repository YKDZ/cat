import eslint from "@eslint/js";
import unocss from "@unocss/eslint-config/flat";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import type { ConfigArray } from "typescript-eslint";
import tseslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/generated/prisma/**", "*.js", "*.cjs"],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        1,
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-namespace": 0,
    },
  },

  {
    files: ["**/*.vue", "**/*.ts"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          format: ["camelCase"],
        },
        {
          selector: "variable",
          modifiers: ["const"],
          format: ["UPPER_CASE", "camelCase", "PascalCase"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
      ],
    },
  },

  ...pluginVue.configs["flat/recommended"],

  {
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/max-attributes-per-line": "off",
      "vue/html-self-closing": "off",
      "no-multiple-empty-lines": "error",
      "vue/block-order": [
        "error",
        {
          order: ["script", "template", "style", "i18n"],
        },
      ],
    },
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
  },

  {
    rules: {
      "linebreak-style": ["error", "unix"],
    },
  },

  unocss,
  eslintConfigPrettier,
) as ConfigArray;
