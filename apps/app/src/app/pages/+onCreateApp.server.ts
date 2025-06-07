import type { PageContextServer } from "vike/types";

export const onCreateApp = async (ctx: PageContextServer) => {
  const { app } = ctx;

  if (!app) return;

  app.use(ctx.pinia!);
};
