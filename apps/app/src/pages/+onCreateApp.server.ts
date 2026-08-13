import type { PageContextServer } from "vike/types";

import { vPerm } from "#/directives/v-perm.ts";
import {
  createServerI18n,
  type ServerI18n,
  type ServerI18nContext,
} from "#/utils/i18n.server.ts";

type ServerAppContext = {
  app: PageContextServer["app"];
  displayLanguage: PageContextServer["displayLanguage"];
  globalContext: ServerI18nContext["globalContext"];
  i18n?: ServerI18n;
  pinia?: PageContextServer["pinia"];
};

export const onCreateApp = async (ctx: ServerAppContext) => {
  const { app } = ctx;

  if (!app) return;

  app.use(ctx.pinia!);

  ctx.i18n = await createServerI18n(ctx);
  app.use(ctx.i18n);
  app.directive("perm", vPerm);
};
