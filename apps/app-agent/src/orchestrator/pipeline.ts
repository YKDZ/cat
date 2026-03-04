import type { Orchestration } from "@/schema/agent-definition";

import type { AgentRunner, PipelineResult, PipelineStageResult } from "./types";

// ─── Pipeline Orchestrator ───
//
// Executes agents in sequence: each stage's output feeds into the next.
// The `inputFrom` field on each stage determines which previous output(s)
// are injected into the agent's input context.

export type PipelineOptions = {
  orchestration: Orchestration;
  /** Initial input text to feed the first stage */
  initialInput: string;
  /** Runs a single agent with given input and accumulated context */
  runAgent: AgentRunner;
};

/**
 * Execute a pipeline orchestration.
 *
 * Stages are processed sequentially. Each stage receives:
 * - The output(s) from previous stages (as specified by `inputFrom`)
 * - The accumulated context of all prior stage outputs
 *
 * If any stage fails, the pipeline halts and returns partial results.
 */
export const runPipeline = async (
  options: PipelineOptions,
): Promise<PipelineResult> => {
  const { orchestration, initialInput, runAgent } = options;
  const stages = orchestration.stages;
  const stageResults: PipelineStageResult[] = [];
  const outputs = new Map<string, string>();

  // Seed the context with the initial input
  outputs.set("_input", initialInput);

  for (const stage of stages) {
    // Determine the input for this stage
    const input = resolveStageInput(stage.inputFrom, outputs, initialInput);

    // Build a context record from all prior outputs
    const context: Record<string, string> = {};
    for (const [key, value] of outputs) {
      context[key] = value;
    }

    // Run the agent
    // oxlint-disable-next-line no-await-in-loop -- pipeline stages must be sequential
    const result = await runAgent(stage.agentId, input, context);

    const stageResult: PipelineStageResult = {
      agentId: stage.agentId,
      outputKey: stage.outputKey,
      output: result.output,
      success: result.success,
      error: result.error,
    };
    stageResults.push(stageResult);

    if (!result.success) {
      // Pipeline halts on failure
      return {
        mode: "pipeline",
        stages: stageResults,
        finalOutput: null,
        success: false,
      };
    }

    // Store the output for subsequent stages
    if (result.output !== null) {
      outputs.set(stage.outputKey, result.output);
    }
  }

  // The last stage's output is the pipeline's final output
  const lastResult = stageResults.at(-1);
  return {
    mode: "pipeline",
    stages: stageResults,
    finalOutput: lastResult?.output ?? null,
    success: true,
  };
};

// ─── Helpers ───

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

  // Multiple inputs: concatenate them
  return inputFrom
    .map((key) => {
      const value = outputs.get(key);
      return value ? `[${key}]:\n${value}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
};
