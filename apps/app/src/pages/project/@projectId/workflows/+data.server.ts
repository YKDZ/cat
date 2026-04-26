import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const runs = await ssc(ctx).agent.listProjectRuns({
    projectId,
    limit: 20,
    offset: 0,
  });

  return { runs, projectId };
};

export type Data = Awaited<ReturnType<typeof data>>;
