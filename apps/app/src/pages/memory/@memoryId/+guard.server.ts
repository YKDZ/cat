import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);

  const { memoryId } = ctx.routeParams;
  if (!memoryId) throw render("/", `Invalid route params`);
};
