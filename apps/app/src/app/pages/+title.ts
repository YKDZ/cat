import type { PageContext } from "vike/types";

export const title = (ctx: PageContext) => {
  return ctx.globalContext.name;
};
