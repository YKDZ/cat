import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId, prNumber } = ctx.routeParams;

  if (!projectId) throw render("/", "Project id is required");
  if (!prNumber)
    throw render(
      `/project/${projectId}/pull-requests`,
      "PR number is required",
    );

  const pr = await ssc(ctx).pullRequest.getProjectPRByNumber({
    projectId,
    number: parseInt(prNumber, 10),
  });

  if (!pr)
    throw render(
      `/project/${projectId}/pull-requests`,
      `PR #${prNumber} does not exist`,
    );

  return { projectId, pr };
};

export type Data = Awaited<ReturnType<typeof data>>;
