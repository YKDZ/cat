import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import cspellPlugin from "@cspell/eslint-plugin";
import cspellWords from "./cspell.words.json" assert { type: "json" };
import importPlugin from "eslint-plugin-import";
import pluginOxlint from "eslint-plugin-oxlint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  {
    ignores: ["**/dist/**/*", "**/generated/prisma/**", "*.js", "*.cjs"],
    languageOptions: {
      parserOptions: {
        projectServices: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  ...pluginOxlint.configs["flat/recommended"],

  {
    plugins: { import: importPlugin },
    rules: {
      "import/enforce-node-protocol-usage": ["error", "always"],
      // "import/extensions": [
      //   "error",
      //   "always",
      //   {
      //     ignorePackages: true,
      //     checkTypeImports: true,
      //   },
      // ],
    },
  },

  {
    rules: {
      "linebreak-style": ["error", "unix"],
    },
  },

  eslintConfigPrettier,

  {
    plugins: { "@cspell": cspellPlugin },
    rules: {
      "@cspell/spellchecker": [
        "warn",
        {
          cspell: {
            words: cspellWords,
          },
        },
      ],
    },
  },
);
