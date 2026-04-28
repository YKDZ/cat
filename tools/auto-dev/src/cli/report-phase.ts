import { WorkflowManager } from "../coordinator/index.js";

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
  await manager.updatePhase(runId, phase as any);

  if (values.summary) {
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
