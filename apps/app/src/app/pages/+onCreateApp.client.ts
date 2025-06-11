import { createPinia } from "pinia";
import type { PageContextClient } from "vike/types";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

export const onCreateApp = (ctx: PageContextClient) => {
  const { app } = ctx;

  if (!app) return;

  hydratePinia(ctx);

  app.use(ctx.globalContext.pinia!);
};

const hydratePinia = (ctx: PageContextClient) => {
  ctx.globalContext.pinia = createPinia();
  ctx.globalContext.pinia.use(piniaPluginPersistedstate);

  if (ctx._piniaInitState)
    ctx.globalContext.pinia.state.value = ctx._piniaInitState;
};
