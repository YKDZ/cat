import type { DbHandle } from "@cat/domain";

import type { TypedNodeContext } from "./types.ts";

export const requireWorkflowDatabase = (
  ctx: Pick<TypedNodeContext, "db">,
): DbHandle => {
  if (ctx.db === undefined) {
    throw new Error("Workflow runtime database is not configured.");
  }
  return ctx.db;
};
