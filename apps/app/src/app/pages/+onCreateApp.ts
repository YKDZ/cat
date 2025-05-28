import { createPinia } from "pinia";
import { PageContext } from "vike/types";

export const onCreateApp = (ctx: PageContext) => {
  const { app } = ctx;

  if (!app) return;

  if (!import.meta.env.SSR) hydratePinia(ctx);

  app.use(ctx.globalContext.pinia ?? ctx.pinia!);
};

const hydratePinia = (ctx: PageContext) => {
  ctx.globalContext.pinia = createPinia();
  if (ctx._piniaInitState)
    ctx.globalContext.pinia.state.value = ctx._piniaInitState;
};
