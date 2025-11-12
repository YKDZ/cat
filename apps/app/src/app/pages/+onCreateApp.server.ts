import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import type { GlobalContextServer, PageContextServer } from "vike/types";
import type { ComputedRef } from "vue";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { getSetting } from "@cat/db";
import { i18n } from "@/app/utils/i18n";
import { parsePreferredLanguage } from "@cat/shared/utils";

export const onCreateApp = async (ctx: PageContextServer) => {
  const { app } = ctx;

  if (!app) return;

  app.use(ctx.pinia!);

  await decorateI18nServer(ctx);
  app.use(i18n);
};

const loadLocaleMessagesInServerSide = async (
  ctx: GlobalContextServer,
  locale: string,
): Promise<void> => {
  if (locale === "zh_cn") {
    if (!ctx.i18nMessages) ctx.i18nMessages = {};
    ctx.i18nMessages[locale] = {};
    return nextTick();
  }
  if (ctx.i18nMessages && ctx.i18nMessages[locale]) return nextTick();

  const path = join(process.cwd(), `./locales/${locale}.json`);
  if (!(await stat(path))) return nextTick();
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

const decorateI18nServer = async (ctx: PageContextServer): Promise<void> => {
  const key =
    ctx.helpers.getCookie("displayLanguage") ??
    parsePreferredLanguage(ctx.helpers.getReqHeader("Accept-Language") ?? "")
      ?.toLocaleLowerCase()
      .replace("-", "_") ??
    (await getSetting(
      ctx.globalContext.drizzleDB.client,
      "server.default-language",
      "zh_cn",
    ));

  // 未加载过客户端指定语言时
  // 进行懒加载
  if (
    Object.keys(ctx.globalContext.i18nMessages ?? {}).findIndex(
      (k) => k === key,
    ) === -1
  ) {
    await loadLocaleMessagesInServerSide(ctx.globalContext, key);
  }

  i18n.global.setLocaleMessage(
    key,
    ctx.globalContext.i18nMessages ? ctx.globalContext.i18nMessages[key] : {},
  );
  i18n.global.locale.value = key;
  ctx.i18n = i18n;
};
