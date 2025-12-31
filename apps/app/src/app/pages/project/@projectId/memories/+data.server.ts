import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const memories = await ssc(ctx).memory.getProjectOwned({
    projectId,
  });

  return { memories };
};

export type Data = Awaited<ReturnType<typeof data>>;
