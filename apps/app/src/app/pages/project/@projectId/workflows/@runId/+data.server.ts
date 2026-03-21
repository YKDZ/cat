import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId, runId } = ctx.routeParams;

  if (!projectId || !runId) throw render(`/`, `Missing params`);

  const project = await ssc(ctx).project.get({ projectId });
  const targetLanguages = await ssc(ctx).project.getTargetLanguages({
    projectId,
  });
  const documents = await ssc(ctx).project.getDocuments({
    projectId,
  });
  const runGraph = await ssc(ctx).agent.getRunGraph({ runId });

  if (!project)
    throw render("/project", `Project ${projectId} does not exists`);

  return { project, targetLanguages, documents, runGraph, projectId, runId };
};

export type Data = Awaited<ReturnType<typeof data>>;
