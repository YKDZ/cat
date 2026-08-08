import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { ssc } from "#/server/ssc.ts";

export const guard = async (ctx: PageContextServer) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);
  const allowed = await ssc(ctx).permission.check({
    objectId: "*",
    objectType: "system",
    relation: "admin",
  });
  if (!allowed) throw render(403, `No permission to access administration`);
};
