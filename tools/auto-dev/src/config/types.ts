import type { AgentModel } from "../shared/types.js";

export interface AgentRegistration {
  definition: string;
  description: string;
  defaultModel: AgentModel;
}

export interface AutoDevConfig {
  agents: Record<string, AgentRegistration>;
  defaultAgent: string;
  pollIntervalSec: number;
  maxDecisionPerRun: number;
  maxImplCycles: number;
}

export const DEFAULT_CONFIG: AutoDevConfig = {
  agents: {
    "full-pipeline": {
      definition: "full-pipeline.md",
      description: "Full brainstorm -> iplan -> impl -> review -> fix workflow",
      defaultModel: "sonnet",
    },
    "one-shot-fix": {
      definition: "one-shot-fix.md",
      description: "Directly investigate and fix from Issue error description",
      defaultModel: "haiku",
    },
    "spec-only": {
      definition: "spec-only.md",
      description: "Brainstorm only, publish spec to Issue",
      defaultModel: "sonnet",
    },
    "impl-only": {
      definition: "impl-only.md",
      description: "Skip design, directly implement from Issue description",
      defaultModel: "sonnet",
    },
  },
  defaultAgent: "full-pipeline",
  pollIntervalSec: 30,
  maxDecisionPerRun: 20,
  maxImplCycles: 5,
};
