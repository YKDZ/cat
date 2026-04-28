import type { AutoDevConfig } from "../config/types.js";
import type {
  AgentProvider,
  AgentEffort,
} from "../shared/types.js";

import { listIssues } from "../shared/gh-cli.js";
import { parseFrontmatter } from "../shared/frontmatter-parser.js";
import { listWorkflowRuns } from "../state-store/index.js";
import { parseIssueLabels, resolveAgentDefinition } from "./label-parser.js";

export interface PollResult {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
  agentDefinition: string;
  agentProvider: AgentProvider | null;
  agentModel: string | null;
  agentEffort: AgentEffort | null;
  autoMerge: boolean;
  permissionMode: string | null;
  maxTurns: number | null;
  maxDecisions: number | null;
  frontmatterConfig: import("../shared/types.js").FrontmatterConfig | null;
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
    const bodyFm = parseFrontmatter(issue.body);

    // Resolve agent: frontmatter > labels > config default
    let agentDefinition = resolveAgentDefinition(labelConfig, issue.body, config);
    if (bodyFm?.agent && config.agents[bodyFm.agent]) {
      agentDefinition = bodyFm.agent;
    } else if (bodyFm?.agent) {
      console.warn(
        `[auto-dev] Frontmatter specifies agent "${bodyFm.agent}" but it is not available.`,
      );
    }

    results.push({
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body,
      labels: labelNames,
      agentDefinition,
      agentProvider: labelConfig.agentProvider,
      agentModel: bodyFm?.model ?? labelConfig.agentModel,
      agentEffort: bodyFm?.effort ?? labelConfig.agentEffort,
      autoMerge: labelConfig.autoMerge,
      permissionMode: bodyFm?.permissionMode ?? labelConfig.permissionMode,
      maxTurns: bodyFm?.maxTurns ?? labelConfig.maxTurns,
      maxDecisions: bodyFm?.maxDecisions ?? labelConfig.maxDecisions,
      frontmatterConfig: bodyFm,
    });
  }

  return results;
};
