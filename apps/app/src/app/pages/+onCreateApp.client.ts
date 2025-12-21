import type { PageContextClient } from "vike/types";

export const onCreateApp = async (ctx: PageContextClient): Promise<void> => {
  const { app } = ctx;

  if (!app) return;

  app.use(ctx.globalContext.pinia!);
  app.use(ctx.globalContext.i18n!);
};
