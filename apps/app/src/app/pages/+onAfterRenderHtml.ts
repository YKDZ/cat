import type { PageContextServer } from "vike/types";
import type { ComputedRef } from "vue";

export const onAfterRenderHtml = (ctx: PageContextServer) => {
  ctx._piniaInitState = ctx.pinia!.state.value;
  ctx.i18nMessages = (ctx.i18n!.global.messages as ComputedRef).value[
    ctx.displayLanguage
  ];
};
