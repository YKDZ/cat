import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

import { withProjectShell } from "../project-shell.server";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render("/", "Project id is required");

  return await withProjectShell(ctx, async () => {
    const pullRequests = await ssc(ctx).pullRequest.listProjectPRs({
      projectId,
    });

    return { projectId, pullRequests };
  });
};

export type Data = Awaited<ReturnType<typeof data>>;
