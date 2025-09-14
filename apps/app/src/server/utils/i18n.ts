import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "fs-extra";
import type { GlobalContextServer } from "vike/types";
import type { ComputedRef } from "vue";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";

export const setupI18n = () =>
  createI18n({
    legacy: false,
    fallbackLocale: "zh_cn",
    fallbackFormat: true,
    missingWarn: false,
    fallbackWarn: false,
    formatFallbackMessages: true,
    globalInjection: true,
  });

export const loadLocaleMessagesInServerSide = async (
  ctx: GlobalContextServer,
  locale: string,
) => {
  if (locale === "zh_cn") {
    if (!ctx.i18nMessages) ctx.i18nMessages = {};
    ctx.i18nMessages[locale] = {};
    return nextTick();
  }
  if (ctx.i18nMessages && ctx.i18nMessages[locale]) return nextTick();

  const path = join(process.cwd(), `./locales/${locale}.json`);
  if (!(await exists(path))) return nextTick();
  const fileContent = await readFile(path, "utf-8");
  const messages = JSON.parse(fileContent);
  const tempI18n = createI18n({
    legacy: false,
    fallbackLocale: "zh_cn",
    fallbackFormat: true,
    missingWarn: false,
    fallbackWarn: false,
    formatFallbackMessages: true,
    globalInjection: true,
  });
  tempI18n.global.setLocaleMessage(locale, messages);

  // 将语言加载到全局上下文
  if (!ctx.i18nMessages) ctx.i18nMessages = {};
  ctx.i18nMessages[locale] = (
    tempI18n.global.messages as ComputedRef<{ [key: string]: unknown }>
  ).value[locale];

  return nextTick();
};

export const parsePreferredLanguage = (
  acceptLanguage: string,
): string | null => {
  if (!acceptLanguage) return null;

  return (
    acceptLanguage
      .split(",")
      .map((entry) => {
        const [lang, qValue] = entry.trim().split(";q=");
        return {
          lang,
          q: qValue !== undefined ? parseFloat(qValue) : 1.0,
        };
      })
      .sort((a, b) => b.q - a.q)[0]?.lang ?? null
  );
};
