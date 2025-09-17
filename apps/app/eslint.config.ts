import config from "@cat/eslint-config";
import vueI18n from "@intlify/eslint-plugin-vue-i18n";
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";
import unocss from "@unocss/eslint-config/flat";
import cat from "@cat/eslint-plugin-cat";

export default defineConfigWithVueTs(
  {
    extends: [config],
  },

  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,
  {
    rules: {
      "vue/attributes-order": "warn",
    },
  },
  skipFormatting,
  {
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },

  ...vueI18n.configs.recommended,
  {
    rules: {
      "@intlify/vue-i18n/no-dynamic-keys": "error",
      "@intlify/vue-i18n/no-missing-keys": "off",
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

  unocss,
  cat,
);
