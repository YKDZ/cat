import { createPinia } from "pinia";
import { PageContextClient } from "vike/types";

export const onCreateApp = (ctx: PageContextClient) => {
  const { app } = ctx;

  if (!app) return;

  hydratePinia(ctx);

  app.use(ctx.globalContext.pinia!);
};

const hydratePinia = (ctx: PageContextClient) => {
  ctx.globalContext.pinia = createPinia();

  if (ctx._piniaInitState)
    ctx.globalContext.pinia.state.value = ctx._piniaInitState;
};
