import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { type DisplayLanguage, DisplayLanguageSchema } from "@cat/shared";
import type { GlobalContextServer } from "vike/types";
import type { ComputedRef } from "vue";
import { nextTick } from "vue";

import { createAppI18n } from "#/utils/i18n.ts";

type I18nMessageCache = Pick<GlobalContextServer, "i18nMessages">;

export type ServerI18n = ReturnType<typeof createAppI18n>;

export type ServerI18nContext = Readonly<{
  displayLanguage: DisplayLanguage;
  globalContext: I18nMessageCache;
}>;

const localeAssets = {
  en_us: "./locales/en_us.json",
  zh_cn: null,
} satisfies Record<DisplayLanguage, string | null>;

const loadLocaleMessagesInServerSide = async (
  ctx: I18nMessageCache,
  locale: DisplayLanguage,
): Promise<void> => {
  const asset = localeAssets[locale];
  if (asset === null) {
    if (!ctx.i18nMessages) ctx.i18nMessages = {};
    ctx.i18nMessages[locale] = {};
    return nextTick();
  }
  if (ctx.i18nMessages && ctx.i18nMessages[locale]) return nextTick();

  const path = join(process.cwd(), asset);
  const fileContent = await readFile(path, "utf-8");
  const messages = JSON.parse(fileContent);
  const tempI18n = createAppI18n();
  tempI18n.global.setLocaleMessage(locale, messages);

  if (!ctx.i18nMessages) ctx.i18nMessages = {};
  ctx.i18nMessages[locale] = (
    tempI18n.global.messages as ComputedRef<{ [key: string]: unknown }>
  ).value[locale];

  return nextTick();
};

export const createServerI18n = async (
  ctx: ServerI18nContext,
): Promise<ServerI18n> => {
  const key = DisplayLanguageSchema.parse(ctx.displayLanguage);

  // Load request-specific locale messages only when the deployment cache misses.
  if (
    Object.keys(ctx.globalContext.i18nMessages ?? {}).findIndex(
      (candidate) => candidate === key,
    ) === -1
  ) {
    await loadLocaleMessagesInServerSide(ctx.globalContext, key);
  }

  const requestI18n = createAppI18n();
  requestI18n.global.setLocaleMessage(
    key,
    ctx.globalContext.i18nMessages ? ctx.globalContext.i18nMessages[key] : {},
  );
  requestI18n.global.locale.value = key;
  return requestI18n;
};
