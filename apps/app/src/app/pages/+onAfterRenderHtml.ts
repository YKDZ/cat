import type { PageContextServer } from "vike/types";

export const onAfterRenderHtml = (ctx: PageContextServer) => {
  ctx._piniaInitState = ctx.pinia!.state.value;
};
