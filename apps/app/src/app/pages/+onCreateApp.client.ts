import type { PageContextClient } from "vike/types";
import { hydrateQueryCache, PiniaColada } from "@pinia/colada";
import { useQueryCache } from "@pinia/colada";
import { deserializePiniaState } from "@/app/utils/pinia.ts";

export const onCreateApp = async (ctx: PageContextClient): Promise<void> => {
  const { app } = ctx;

  if (!app) return;

  app.use(ctx.globalContext.pinia!);
  app.use(ctx.globalContext.i18n!);
  app.use(PiniaColada, {
    queryOptions: {
      gcTime: 300_000,
    },
  });

  hydratePinia(ctx);
};

const hydratePinia = (ctx: PageContextClient) => {
  const initState = ctx._piniaInitState;

  if (!initState) return;

  const { vanilla, colada } = deserializePiniaState(initState);

  if (vanilla) ctx.globalContext.pinia!.state.value = vanilla;

  if (colada) hydrateQueryCache(useQueryCache(ctx.globalContext.pinia), colada);
};
