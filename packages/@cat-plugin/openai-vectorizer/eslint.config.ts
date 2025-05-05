import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "server/database/generated/*",
      // Temporary compiled files
      "**/*.ts.build-*.mjs",

      // JS files at the root of the project
      "*.js",
      "*.cjs",
      "*.mjs",
    ],
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
    rules: {
      "no-multiple-empty-lines": "off",
      "prettier/prettier": "error",
    },
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
  },
  
  prettier,
);
