import { createI18n } from "vue-i18n";

export const i18n = createI18n({
  legacy: false,
  fallbackLocale: "zh_cn",
  fallbackFormat: true,
  missingWarn: false,
  fallbackWarn: false,
  formatFallbackMessages: true,
  globalInjection: true,
});
