import { createPinia } from "pinia";
import type { PageContextClient } from "vike/types";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { getCookieFunc } from "@cat/shared";
import { usePreferredLanguages } from "@vueuse/core";
import { createI18n } from "vue-i18n";

export const onCreateApp = async (ctx: PageContextClient) => {
  const { app } = ctx;

  if (!app) return;

  hydratePinia(ctx);
  app.use(ctx.globalContext.pinia!);

  app.use(await hydrateI18n(ctx));
};

const hydratePinia = (ctx: PageContextClient) => {
  ctx.globalContext.pinia = createPinia();
  ctx.globalContext.pinia.use(piniaPluginPersistedstate);

  if (ctx._piniaInitState)
    ctx.globalContext.pinia.state.value = ctx._piniaInitState;
};

const hydrateI18n = async (ctx: PageContextClient) => {
  const i18n = createI18n({
    legacy: false,
    fallbackLocale: "zh_cn",
    fallbackFormat: true,
    formatFallbackMessages: true,
  });
  ctx.i18n = i18n;

  const key =
    getCookieFunc(document.cookie)("displayLanguage") ??
    usePreferredLanguages().value[0]?.toLocaleLowerCase().replace("-", "_") ??
    "zh_cn";

  if (
    typeof ctx.i18nMessages === "object" &&
    Object.keys(ctx.i18nMessages).findIndex((k) => k === key) !== -1
  ) {
    i18n.global.setLocaleMessage(key, ctx.i18nMessages[key]);
    i18n.global.locale.value = key;
  }

  return i18n;
};
