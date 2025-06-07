import type { PageContextServer } from "vike/types";
import { createPinia } from "pinia";

export const onCreatePageContext = (ctx: PageContextServer) => {
  ctx.pinia = createPinia();
};
