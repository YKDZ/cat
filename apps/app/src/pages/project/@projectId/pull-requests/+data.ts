import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { ssc } from "#/server/ssc.ts";

import { withProjectShell } from "../project-shell.server.ts";

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
