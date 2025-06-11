import type { Pinia } from "pinia";
import type { PageContextServer } from "vike/types";

export const injectPiniaData = <T>(
  handler: (pinia: Pinia, data: T) => void,
) => {
  return (
    ctx: Pick<
      PageContextServer & { data?: T },
      "data" | "pinia" | "isPrerendering"
    >,
  ) => {
    if (!ctx.data) return;
    handler(ctx.pinia!, ctx.data);
    if (!ctx.isPrerendering) delete ctx.data;
  };
};
