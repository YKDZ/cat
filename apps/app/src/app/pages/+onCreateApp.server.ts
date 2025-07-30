import {
  loadLocaleMessagesInServerSide,
  parsePreferredLanguage,
  setupI18n,
} from "@/server/utils/i18n";
import { prisma, setting } from "@cat/db";
import type { PageContextServer } from "vike/types";

export const onCreateApp = async (ctx: PageContextServer) => {
  const { app } = ctx;

  if (!app) return;

  app.use(ctx.pinia!);
  app.use(await loadI18n(ctx));
};

const loadI18n = async (ctx: PageContextServer) => {
  const i18n = setupI18n();
  const key =
    ctx.helpers.getCookie("displayLanguage") ??
    parsePreferredLanguage(ctx.helpers.getReqHeader("Accept-Language") ?? "")
      ?.toLocaleLowerCase()
      .replace("-", "_") ??
    (await setting("server.default-language", "zh_cn", prisma));

  // 未加载过客户端指定语言时
  // 进行懒加载
  if (
    Object.keys(ctx.globalContext.i18nMessages ?? {}).findIndex(
      (k) => k === key,
    ) === -1
  ) {
    await loadLocaleMessagesInServerSide(ctx.globalContext, key);
  }

  i18n.global.setLocaleMessage(key, ctx.globalContext.i18nMessages[key]);
  i18n.global.locale.value = key;
  ctx.i18n = i18n;

  return i18n;
};
