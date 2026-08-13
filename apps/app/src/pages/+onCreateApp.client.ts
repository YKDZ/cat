import { hydrateQueryCache, PiniaColada } from "@pinia/colada";
import { useQueryCache } from "@pinia/colada";
import type { PageContextClient } from "vike/types";

import { vPerm } from "#/directives/v-perm.ts";
import { deserializePiniaState } from "#/utils/pinia.ts";

export const onCreateApp = async (ctx: PageContextClient): Promise<void> => {
  const { app } = ctx;

  if (!app) return;
  const appI18n = ctx.globalContext.i18n;
  if (appI18n === undefined) {
    throw new Error("Client i18n was not initialized");
  }
  const locale = appI18n.global.locale;
  if (typeof locale === "string") {
    appI18n.global.locale = ctx.displayLanguage;
  } else {
    locale.value = ctx.displayLanguage;
  }

  app.use(ctx.globalContext.pinia!);
  app.use(appI18n);
  app.use(PiniaColada, {
    queryOptions: {
      gcTime: 300_000,
    },
  });
  app.directive("perm", vPerm);

  hydratePinia(ctx);
};

const hydratePinia = (ctx: PageContextClient) => {
  const initState = ctx._piniaInitState;

  if (!initState) return;

  const { vanilla, colada } = deserializePiniaState(initState);

  if (vanilla) ctx.globalContext.pinia!.state.value = vanilla;

  if (colada) hydrateQueryCache(useQueryCache(ctx.globalContext.pinia), colada);
};
