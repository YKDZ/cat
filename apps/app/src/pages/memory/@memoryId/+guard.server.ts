import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);

  const { memoryId } = ctx.routeParams;
  if (!memoryId) throw render("/", `Invalid route params`);
};
