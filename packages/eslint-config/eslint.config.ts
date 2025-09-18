import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import cspellPlugin from "@cspell/eslint-plugin";
import type { Options } from "@cspell/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import pluginOxlint from "eslint-plugin-oxlint";
import { defineConfig, globalIgnores } from "eslint/config";
import cspellWords from "./cspell.words.json" with { type: "json" };

export default defineConfig(
  globalIgnores(["dist/", "**/generated/prisma/"]),

  {
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
      "import/order": "warn",
      "import/enforce-node-protocol-usage": ["error", "always"],
      "import/extensions": [
        "warn",
        "always",
        {
          ignorePackages: true,
          checkTypeImports: true,
        },
      ],
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
          numSuggestions: 5,
          autoFix: false,
          generateSuggestions: true,
          cspell: {
            words: cspellWords,
          },
        } satisfies Options,
      ],
    },
  },
);
