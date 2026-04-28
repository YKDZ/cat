import type { AutoDevConfig } from "../config/types.js";
import type {
  AgentProvider,
  AgentEffort,
  IssueLabelConfig,
} from "../shared/types.js";

const LABEL_PREFIXES = {
  agent: "agent:",
  model: "model:",
  effort: "effort:",
  workflow: "workflow:",
  autoMerge: "pr:auto-merge",
  permission: "permission:",
  maxTurns: "max-turns:",
  maxDecisions: "max-decisions:",
} as const;

export const parseIssueLabels = (labelNames: string[]): IssueLabelConfig => {
  const config: IssueLabelConfig = {
    agentProvider: null,
    agentModel: null,
    agentEffort: null,
    workflowAgent: null,
    autoMerge: false,
    permissionMode: null,
    maxTurns: null,
    maxDecisions: null,
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
      if (model.length > 0) {
        config.agentModel = model;
      }
    } else if (label.startsWith(LABEL_PREFIXES.effort)) {
      const effort = label.slice(LABEL_PREFIXES.effort.length);
      if (
        effort === "xhigh" ||
        effort === "high" ||
        effort === "medium" ||
        effort === "low" ||
        effort === "max"
      ) {
        config.agentEffort = effort as AgentEffort;
      }
    } else if (label.startsWith(LABEL_PREFIXES.workflow)) {
      config.workflowAgent = label.slice(LABEL_PREFIXES.workflow.length);
    } else if (label.startsWith(LABEL_PREFIXES.permission)) {
      const mode = label.slice(LABEL_PREFIXES.permission.length);
      if (mode === "plan" || mode === "auto" || mode === "default") {
        config.permissionMode = mode;
      }
    } else if (label.startsWith(LABEL_PREFIXES.maxTurns)) {
      const val = parseInt(label.slice(LABEL_PREFIXES.maxTurns.length), 10);
      if (!isNaN(val) && val > 0) config.maxTurns = val;
    } else if (label.startsWith(LABEL_PREFIXES.maxDecisions)) {
      const val = parseInt(label.slice(LABEL_PREFIXES.maxDecisions.length), 10);
      if (!isNaN(val) && val > 0) config.maxDecisions = val;
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
