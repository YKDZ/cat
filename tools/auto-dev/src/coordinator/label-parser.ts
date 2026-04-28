import type { AgentProvider, AgentModel, AgentEffort, IssueLabelConfig } from "../shared/types.js";
import type { AutoDevConfig } from "../config/types.js";

const LABEL_PREFIXES = {
  agent: "agent:",
  model: "model:",
  effort: "effort:",
  workflow: "workflow:",
  autoMerge: "pr:auto-merge",
} as const;

export const parseIssueLabels = (labelNames: string[]): IssueLabelConfig => {
  const config: IssueLabelConfig = {
    agentProvider: null,
    agentModel: null,
    agentEffort: null,
    workflowAgent: null,
    autoMerge: false,
  };

  for (const label of labelNames) {
    if (label === LABEL_PREFIXES.autoMerge) {
      config.autoMerge = true;
    } else if (label.startsWith(LABEL_PREFIXES.agent)) {
      const provider = label.slice(LABEL_PREFIXES.agent.length);
      if (provider === "claude-code" || provider === "copilot") {
        config.agentProvider = provider as AgentProvider;
      }
    } else if (label.startsWith(LABEL_PREFIXES.model)) {
      const model = label.slice(LABEL_PREFIXES.model.length);
      if (model === "opus" || model === "sonnet" || model === "haiku") {
        config.agentModel = model as AgentModel;
      }
    } else if (label.startsWith(LABEL_PREFIXES.effort)) {
      const effort = label.slice(LABEL_PREFIXES.effort.length);
      if (effort === "high" || effort === "medium" || effort === "low") {
        config.agentEffort = effort as AgentEffort;
      }
    } else if (label.startsWith(LABEL_PREFIXES.workflow)) {
      config.workflowAgent = label.slice(LABEL_PREFIXES.workflow.length);
    }
  }

  return config;
};

export const parseAtMentionAgent = (body: string): string | null => {
  const match = body.match(/@auto-dev\s+(\S+)/);
  return match?.[1] ?? null;
};

export const resolveAgentDefinition = (
  labels: IssueLabelConfig,
  body: string,
  config: AutoDevConfig,
): string => {
  if (labels.workflowAgent) {
    if (config.agents[labels.workflowAgent]) {
      return labels.workflowAgent;
    }
    console.warn(
      `[auto-dev] Issue specifies workflow "${labels.workflowAgent}" but it is not available.`,
    );
  }

  const atMention = parseAtMentionAgent(body);
  if (atMention) {
    if (config.agents[atMention]) {
      return atMention;
    }
    console.warn(
      `[auto-dev] Issue @-mentions agent "${atMention}" but it is not available.`,
    );
  }

  return config.defaultAgent;
};
