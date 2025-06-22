import config from "@cat/eslint-config";
import type { ConfigArray } from "typescript-eslint";
import tseslint from "typescript-eslint";
import vueI18n from "@intlify/eslint-plugin-vue-i18n";

export default tseslint.config(
  { extends: [config] },

  ...vueI18n.configs.recommended,
  {
    rules: {
      "@intlify/vue-i18n/no-dynamic-keys": "error",
      "@intlify/vue-i18n/no-unused-keys": [
        "error",
        {
          extensions: [".ts", ".vue"],
        },
      ],
    },
    settings: {
      "vue-i18n": {
        localeDir: "./locales/*.{json,json5,yaml,yml}",
        messageSyntaxVersion: "^11.1.3",
      },
    },
  },
) as ConfigArray;
