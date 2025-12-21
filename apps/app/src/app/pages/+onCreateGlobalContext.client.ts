import type { GlobalContextClient } from "vike/types";
import { i18n } from "@/app/utils/i18n";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { getCookieFunc } from "@cat/shared/utils";
import { usePreferredLanguages } from "@vueuse/core";

export const onCreateGlobalContext = async (ctx: GlobalContextClient) => {
  await hydrateI18n(ctx);

  ctx.pinia = createPinia();
  ctx.pinia.use(piniaPluginPersistedstate);
};

const hydrateI18n = async (ctx: GlobalContextClient) => {
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
};
