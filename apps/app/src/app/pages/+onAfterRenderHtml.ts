import { PageContext } from "vike/types";

export const onAfterRenderHtml = (ctx: PageContext) => {
  ctx._piniaInitState = ctx.pinia?.state.value;
};
