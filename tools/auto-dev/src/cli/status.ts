import { listWorkflowRuns } from "../state-store/index.js";

export const runStatus = async (args: string[]): Promise<void> => {
  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  const runs = listWorkflowRuns(workspaceRoot);
  console.log(JSON.stringify(runs, null, 2));
};
