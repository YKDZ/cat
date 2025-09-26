import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  return { tasks: [] };
};

export type Data = Awaited<ReturnType<typeof data>>;
