// ─── Orchestration Types ───
//
// Currently only Pipeline mode is implemented.
// Extension points for Parallel and Debate modes are reserved.

export type OrchestrationMode = "pipeline";
// Future: | "parallel" | "debate"

export type PipelineStageResult = {
  agentId: string;
  outputKey: string;
  output: string | null;
  success: boolean;
  error?: string;
};

export type PipelineResult = {
  mode: "pipeline";
  stages: PipelineStageResult[];
  /** Final output from the last stage */
  finalOutput: string | null;
  success: boolean;
};

// Future: ParallelResult, DebateResult
export type OrchestrationResult = PipelineResult;

export type AgentRunner = (
  agentId: string,
  input: string,
  context: Record<string, string>,
) => Promise<{ output: string | null; success: boolean; error?: string }>;
