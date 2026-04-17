import type { PageContextServer } from "vike/types";

import { render } from "vike/abort";

import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { projectId, issueNumber } = ctx.routeParams;

  if (!projectId) throw render("/", "Project id is required");
  if (!issueNumber)
    throw render(`/project/${projectId}/issues`, "Issue number is required");

  const issue = await ssc(ctx).issue.getProjectIssueByNumber({
    projectId,
    number: parseInt(issueNumber, 10),
  });

  if (!issue)
    throw render(
      `/project/${projectId}/issues`,
      `Issue #${issueNumber} does not exist`,
    );

  return { projectId, issue };
};

export type Data = Awaited<ReturnType<typeof data>>;
