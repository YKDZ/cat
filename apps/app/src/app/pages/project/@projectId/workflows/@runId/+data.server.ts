import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId, runId } = ctx.routeParams;

  if (!projectId || !runId) throw render(`/`, `Missing params`);

  const runGraph = await ssc(ctx).agent.getRunGraph({ runId });

  return { runGraph, projectId, runId };
};

export type Data = Awaited<ReturnType<typeof data>>;
