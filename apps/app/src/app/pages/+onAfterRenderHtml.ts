import type { PageContextServer } from "vike/types";
import { stringify } from "devalue";
import {
  isQueryCache,
  serializeQueryCache,
  useQueryCache,
} from "@pinia/colada";
import type { Pinia } from "pinia";

export const serializePiniaState = (pinia: Pinia): string => {
  return stringify(useQueryCache(pinia), {
    PiniaColada_TreeMapNode: (data: unknown) =>
      isQueryCache(data) && serializeQueryCache(data),
  });
};

export type SerializedPiniaState = ReturnType<typeof serializePiniaState>;

export const onAfterRenderHtml = (ctx: PageContextServer) => {
  ctx._piniaInitState = serializePiniaState(ctx.pinia!);
};
