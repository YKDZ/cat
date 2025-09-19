import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

// 在 https://github.com/vikejs/vike/issues/1833 前的 workaround
export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const project = await useSSCTRPC(ctx).project.query({ id: projectId });

  if (!project)
    throw render("/project", `Project ${projectId} does not exists`);

  return { project };
};

export type Data = Awaited<ReturnType<typeof data>>;
