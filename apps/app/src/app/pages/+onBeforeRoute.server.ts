import { PageContext } from "vike/types";

export const onBeforeRoute = (ctx: PageContext) => {
  ctx._piniaInitState = ctx.pinia?.state.value;
};
