import type { AutoDevConfig } from "../config/types.js";

import { listIssues } from "../shared/gh-cli.js";
import { listWorkflowRuns } from "../state-store/index.js";
import { parseIssueLabels, resolveAgentDefinition } from "./label-parser.js";

export interface PollResult {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
  agentDefinition: string;
  agentProvider: string | null;
  agentModel: string | null;
  agentEffort: string | null;
  autoMerge: boolean;
}

export const pollIssues = async (
  repo: string,
  config: AutoDevConfig,
  workspaceRoot: string,
): Promise<PollResult[]> => {
  const activeRuns = listWorkflowRuns(workspaceRoot).filter(
    (r) => !["completed", "failed", "desynced"].includes(r.status),
  );
  const claimedIssueNumbers = new Set(activeRuns.map((r) => r.issueNumber));

  let issues: Awaited<ReturnType<typeof listIssues>>;
  try {
    issues = listIssues(repo, "auto-dev:ready");
  } catch (err) {
    console.error(`[auto-dev] Failed to poll Issues: ${String(err)}`);
    return [];
  }

  const results: PollResult[] = [];

  for (const issue of issues) {
    const labelNames = issue.labels.map((l) =>
      typeof l === "string" ? l : l.name,
    );

    if (labelNames.includes("human-only")) continue;
    if (claimedIssueNumbers.has(issue.number)) continue;

    const labelConfig = parseIssueLabels(labelNames);
    const agentDefinition = resolveAgentDefinition(
      labelConfig,
      issue.body,
      config,
    );

    results.push({
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body,
      labels: labelNames,
      agentDefinition,
      agentProvider: labelConfig.agentProvider,
      agentModel: labelConfig.agentModel,
      agentEffort: labelConfig.agentEffort,
      autoMerge: labelConfig.autoMerge,
    });
  }

  return results;
};
