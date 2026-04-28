import type { IssueLabelConfig } from "../shared/types.js";

export const parseIssueLabels = (labelNames: string[]): IssueLabelConfig => {
  const config: IssueLabelConfig = {
    agentProvider: null,
    agentModel: null,
    agentEffort: null,
    workflowAgent: null,
    autoMerge: false,
  };
  return config;
};

export const parseAtMentionAgent = (body: string): string | null => {
  return null;
};

export const resolveAgentDefinition = (
  labels: IssueLabelConfig,
  body: string,
  config: any,
): string => {
  return config.defaultAgent || "full-pipeline";
};
