import { loadConfig } from "../config/loader.js";

export const runConfig = async (_args: string[]): Promise<void> => {
  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  const config = await loadConfig(workspaceRoot);
  console.log(JSON.stringify(config, null, 2));
};
