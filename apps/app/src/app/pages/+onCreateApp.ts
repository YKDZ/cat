import { createPinia } from "pinia";
import { PageContext } from "vike/types";
import { i18n } from "../utils/i18n";

export const onCreateApp = (ctx: PageContext) => {
  const { app } = ctx;

  if (!app) return;

  if (!import.meta.env.SSR) {
    ctx.globalContext.pinia = createPinia();
  }

  // client: GlobalContext
  // server: PageContext
  app.use(ctx.globalContext.pinia ?? ctx.pinia!);

  app.use(i18n);
};
