import { PageContext } from "vike/types";
import { createPinia } from "pinia";

export const onCreatePageContext = (ctx: PageContext) => {
  ctx.pinia = createPinia();
};
