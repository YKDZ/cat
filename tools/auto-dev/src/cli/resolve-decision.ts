import { loadConfig } from "../config/loader.js";
import { DecisionManager } from "../decision-service/decision-manager.js";
import { ensureStateDirs } from "../state-store/index.js";

export const runResolveDecision = async (args: string[]): Promise<void> => {
  const decisionId = args[0];
  const choice = args[1];
  if (!decisionId || !choice) {
    console.error("Usage: auto-dev resolve-decision <decision-id> <choice>");
    process.exit(1);
  }

  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  await ensureStateDirs(workspaceRoot);
  const config = await loadConfig(workspaceRoot);
  const manager = new DecisionManager(workspaceRoot, config);
  const response = await manager.resolve(decisionId, choice, "cli-user", "cli");
  console.log(JSON.stringify(response, null, 2));
};
