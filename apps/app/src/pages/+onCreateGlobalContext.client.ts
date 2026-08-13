import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import type { GlobalContextClient } from "vike/types";

import { i18n } from "#/utils/i18n.ts";

export const onCreateGlobalContext = async (ctx: GlobalContextClient) => {
  await hydrateI18n(ctx);

  ctx.pinia = createPinia();
  ctx.pinia.use(piniaPluginPersistedstate);
};

const hydrateI18n = async (ctx: GlobalContextClient) => {
  ctx.i18n = i18n;

  for (const [locale, messages] of Object.entries(ctx.i18nMessages ?? {})) {
    i18n.global.setLocaleMessage(locale, messages);
  }
};
