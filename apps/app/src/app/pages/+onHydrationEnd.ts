import type { PageContextClient } from "vike/types";

export const onHydrationEnd = async (ctx: PageContextClient) => {
  document.body.classList.add("hydrated");
};
