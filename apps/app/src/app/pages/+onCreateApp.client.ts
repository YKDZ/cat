import type { PageContextClient } from "vike/types";
import {
  hydrateQueryCache,
  PiniaColada,
  serializeQueryCache,
} from "@pinia/colada";
import { parse } from "devalue";
import { useQueryCache } from "@pinia/colada";

export const onCreateApp = async (ctx: PageContextClient): Promise<void> => {
  const { app } = ctx;

  if (!app) return;

  const revivedData = parse(ctx._piniaInitState ?? "", {
    PiniaColada_TreeMapNode: (data: ReturnType<typeof serializeQueryCache>) =>
      data,
  });

  app.use(ctx.globalContext.pinia!);
  app.use(ctx.globalContext.i18n!);
  app.use(PiniaColada, {
    queryOptions: {
      gcTime: 300_000,
    },
  });

  // oxlint-disable-next-line no-unsafe-argument
  hydrateQueryCache(useQueryCache(ctx.globalContext.pinia), revivedData);
};
