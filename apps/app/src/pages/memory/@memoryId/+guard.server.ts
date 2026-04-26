import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);

  const { memoryId } = ctx.routeParams;
  if (!memoryId) throw render("/", `Invalid route params`);

  const allowed = await ssc(ctx).permission.check({
    objectType: "memory",
    objectId: memoryId,
    relation: "viewer",
  });

  if (!allowed) throw render(403, `No permission to access this memory`);
};
