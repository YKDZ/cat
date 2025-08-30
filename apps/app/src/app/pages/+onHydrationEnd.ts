import type { PageContextClient } from "vike/types";

export const onHydrationEnd = async (ctx: PageContextClient) => {
  console.log(ctx);
  document.body.classList.add("hydrated");
};
