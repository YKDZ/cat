import type { Orchestration } from "@cat/shared/schema/agent";

export type OrchestrationMode = "pipeline";

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
  finalOutput: string | null;
  success: boolean;
};

export type OrchestrationResult = PipelineResult;

export type AgentRunner = (
  agentId: string,
  input: string,
  context: Record<string, string>,
) => Promise<{ output: string | null; success: boolean; error?: string }>;

export type PipelineOptions = {
  orchestration: Orchestration;
  initialInput: string;
  runAgent: AgentRunner;
};

export const runPipeline = async (
  options: PipelineOptions,
): Promise<PipelineResult> => {
  const { orchestration, initialInput, runAgent } = options;
  const stageResults: PipelineStageResult[] = [];
  const outputs = new Map<string, string>();

  outputs.set("_input", initialInput);

  for (const stage of orchestration.stages) {
    const input = resolveStageInput(stage.inputFrom, outputs, initialInput);

    const context: Record<string, string> = {};
    for (const [key, value] of outputs) {
      context[key] = value;
    }

    // oxlint-disable-next-line no-await-in-loop -- pipeline stages must be sequential
    const result = await runAgent(stage.agentId, input, context);

    stageResults.push({
      agentId: stage.agentId,
      outputKey: stage.outputKey,
      output: result.output,
      success: result.success,
      error: result.error,
    });

    if (!result.success) {
      return {
        mode: "pipeline",
        stages: stageResults,
        finalOutput: null,
        success: false,
      };
    }

    if (result.output !== null) {
      outputs.set(stage.outputKey, result.output);
    }
  }

  return {
    mode: "pipeline",
    stages: stageResults,
    finalOutput: stageResults.at(-1)?.output ?? null,
    success: true,
  };
};

const resolveStageInput = (
  inputFrom: string | string[] | undefined,
  outputs: Map<string, string>,
  initialInput: string,
): string => {
  if (inputFrom === undefined) {
    return initialInput;
  }

  if (typeof inputFrom === "string") {
    return outputs.get(inputFrom) ?? initialInput;
  }

  return inputFrom
    .map((key) => {
      const value = outputs.get(key);
      return value ? `[${key}]:\n${value}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
};
