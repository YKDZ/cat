import type { WorkflowPhase } from "../shared/types.js";

import { WorkflowManager } from "../coordinator/index.js";
import { createComment } from "../shared/gh-cli.js";
import { loadWorkflowRun } from "../state-store/index.js";

export const runReportPhase = async (args: string[]): Promise<void> => {
  const { parseArgs } = await import("node:util");
  const { values } = parseArgs({
    args,
    options: {
      "run-id": { type: "string" },
      phase: { type: "string" },
      summary: { type: "string" },
    },
  });

  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  const runId = values["run-id"] ?? "";
  const phase = values.phase ?? "";

  if (!runId || !phase) {
    console.error(
      "Usage: auto-dev report-phase --run-id <id> --phase <phase> [--summary <text>]",
    );
    process.exit(1);
  }

  const manager = new WorkflowManager(workspaceRoot);
  await manager.updatePhase(runId, phase as WorkflowPhase);

  if (values.summary) {
    // Publish phase + summary as a GitHub Issue comment
    const run = loadWorkflowRun(workspaceRoot, runId);
    if (run) {
      const repo = process.env.GITHUB_REPOSITORY ?? "";
      if (repo) {
        try {
          createComment(
            repo,
            run.issueNumber,
            `🔄 **Auto-Dev** Phase Update: \`${phase}\`\n\n${values.summary}`,
          );
        } catch {
          /* best-effort — don't fail the agent if comment fails */
        }
      }
    }

    console.log(
      JSON.stringify({
        runId,
        phase,
        summary: values.summary,
        message: "Phase reported",
      }),
    );
  } else {
    console.log(JSON.stringify({ runId, phase, message: "Phase reported" }));
  }
};
