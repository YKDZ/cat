import { DefaultDisplayLanguage } from "@cat/shared";
import type { UseTimeAgoMessages } from "@vueuse/core";
import { type Composer, createI18n } from "vue-i18n";

export const createAppI18n = () =>
  createI18n({
    legacy: false,
    fallbackLocale: DefaultDisplayLanguage,
    fallbackFormat: true,
    missingWarn: false,
    fallbackWarn: false,
    formatFallbackMessages: true,
    globalInjection: true,
  });

export const i18n = createAppI18n();

export const createTimeAgoMessages = (
  t: Composer["t"],
): UseTimeAgoMessages => ({
  justNow: t("刚刚"),
  past: (value) => (/\d/.test(value) ? t("{time}前", { time: value }) : value),
  future: (value) =>
    /\d/.test(value) ? t("{time}后", { time: value }) : value,
  month: (count, past) =>
    count === 1 ? t(past ? "上月" : "下月") : t("{count} 个月", { count }),
  year: (count, past) =>
    count === 1 ? t(past ? "去年" : "明年") : t("{count} 年", { count }),
  day: (count, past) =>
    count === 1 ? t(past ? "昨天" : "明天") : t("{count} 天", { count }),
  week: (count, past) =>
    count === 1 ? t(past ? "上周" : "下周") : t("{count} 周", { count }),
  hour: (count) => t("{count} 小时", { count }),
  minute: (count) => t("{count} 分钟", { count }),
  second: (count) => t("{count} 秒", { count }),
  invalid: "",
});
