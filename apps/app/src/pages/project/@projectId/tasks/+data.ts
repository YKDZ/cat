import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { withProjectShell } from "../project-shell.server.ts";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  return withProjectShell(ctx, { tasks: [] });
};

export type Data = Awaited<ReturnType<typeof data>>;
