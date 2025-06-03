import { Pinia } from "pinia";
import { PageContext } from "vike/types";

export const injectPiniaData = <T>(
  handler: (pinia: Pinia, data: T) => void,
) => {
  return (ctx: PageContext & { data?: T }) => {
    if (!ctx.data) return;
    handler(ctx.pinia!, ctx.data);
    if (!ctx.isPrerendering) delete ctx.data;
  };
};
