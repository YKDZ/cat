import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const project = await ssc(ctx).project.get({ projectId });
  const targetLanguages = await ssc(ctx).project.getTargetLanguages({
    projectId,
  });
  const documents = await ssc(ctx).project.getDocuments({
    projectId,
  });

  if (!project)
    throw render("/project", `Project ${projectId} does not exists`);

  return { project, targetLanguages, documents };
};

export type Data = Awaited<ReturnType<typeof data>>;
