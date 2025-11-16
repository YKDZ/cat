import type { UseTimeAgoMessages } from "@vueuse/core";
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

const { t } = i18n.global;

export const i18nUseTimeAgoMessages: UseTimeAgoMessages = {
  justNow: t("刚刚"),
  past: (n) => (n.match(/\d/) ? `${n}前` : n),
  future: (n) => (n.match(/\d/) ? `${n}后` : n),
  month: (n, past) => (n === 1 ? (past ? t("上月") : t("下月")) : `${n} 月`),
  year: (n, past) => (n === 1 ? (past ? t("去年") : t("明年")) : `${n} 年`),
  day: (n, past) => (n === 1 ? (past ? t("昨天") : t("明天")) : `${n} 天`),
  week: (n, past) => (n === 1 ? (past ? t("上周") : t("下周")) : `${n} 周`),
  hour: (n) => `${n}小时`,
  minute: (n) => `${n}分钟`,
  second: (n) => `${n}秒`,
  invalid: "",
};
