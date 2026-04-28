import { listWorkflowRuns } from "../state-store/index.js";

export const runList = async (args: string[]): Promise<void> => {
  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  const runs = listWorkflowRuns(workspaceRoot);
  for (const run of runs) {
    console.log(
      `#${run.issueNumber} [${run.status}] ${run.branch} (${run.id.slice(0, 8)})`,
    );
  }
  if (runs.length === 0) {
    console.log("No active runs.");
  }
};
