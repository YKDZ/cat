import { Coordinator } from "../coordinator/index.js";

export const runStart = async (args: string[]): Promise<void> => {
  const { parseArgs } = await import("node:util");
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: "string", short: "r" },
    },
  });

  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  const repoFullName =
    values.repo ?? process.env.GITHUB_REPOSITORY ?? "owner/repo";

  const coordinator = new Coordinator(workspaceRoot, repoFullName);
  await coordinator.start();

  await new Promise(() => {});
};
