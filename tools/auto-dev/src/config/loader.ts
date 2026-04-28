import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AutoDevConfig, AgentRegistration } from "./types.js";
import { AutoDevConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./types.js";
import { ConfigLoadError } from "../shared/errors.js";
import type { AgentProvider, AgentModel, AgentEffort, IssueLabelConfig } from "../shared/types.js";

/**
 * Load and validate auto-dev configuration.
 */
export const loadConfig = async (
  workspaceRoot: string,
): Promise<AutoDevConfig> => {
  const configPath = resolve(workspaceRoot, "auto-dev.config.ts");

  if (!existsSync(configPath)) {
    console.warn(
      `[auto-dev] No auto-dev.config.ts found at ${configPath}, using built-in defaults.`,
    );
    return { ...DEFAULT_CONFIG };
  }

  let rawConfig: unknown;
  try {
    const configModule: { default: unknown } = await import(
      pathToFileURL(configPath).href
    );
    rawConfig = configModule.default;
  } catch (err) {
    console.warn(
      `[auto-dev] Failed to load auto-dev.config.ts: ${String(err)}. Using built-in defaults.`,
    );
    return { ...DEFAULT_CONFIG };
  }

  const result = AutoDevConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.warn(
      `[auto-dev] Invalid auto-dev.config.ts, using built-in defaults:\n${issues}`,
    );
    return { ...DEFAULT_CONFIG };
  }

  const config: AutoDevConfig = {
    agents: result.data.agents as Record<string, AgentRegistration>,
    defaultAgent: result.data.defaultAgent,
    pollIntervalSec: result.data.pollIntervalSec,
    maxDecisionPerRun: result.data.maxDecisionPerRun,
    maxImplCycles: result.data.maxImplCycles,
  };

  // Validate agent definition files exist
  const agentsDir = resolve(import.meta.dirname, "../../agents");
  const validatedAgents: Record<string, AgentRegistration> = {};

  for (const [name, reg] of Object.entries(config.agents)) {
    const defPath = resolve(agentsDir, reg.definition);
    if (existsSync(defPath)) {
      validatedAgents[name] = reg;
    } else {
      console.warn(
        `[auto-dev] Agent definition file not found for "${name}": ${defPath}. Removing from registry.`,
      );
    }
  }

  config.agents = validatedAgents;

  // Validate defaultAgent exists
  const agentNames = Object.keys(validatedAgents);
  if (!validatedAgents[config.defaultAgent]) {
    const fallback = agentNames[0];
    if (fallback) {
      console.warn(
        `[auto-dev] defaultAgent "${config.defaultAgent}" not found, falling back to "${fallback}".`,
      );
      config.defaultAgent = fallback;
    } else {
      throw new ConfigLoadError(
        "No valid agent definitions found and no default available.",
      );
    }
  }

  // Clamp numeric values
  config.pollIntervalSec = Math.max(10, Math.min(3600, config.pollIntervalSec));
  config.maxDecisionPerRun = Math.max(1, Math.min(100, config.maxDecisionPerRun));
  config.maxImplCycles = Math.max(1, Math.min(50, config.maxImplCycles));

  return config;
};

const LABEL_PREFIXES = {
  agent: "agent:",
  model: "model:",
  effort: "effort:",
  workflow: "workflow:",
  autoMerge: "pr:auto-merge",
} as const;

/**
 * Extract configuration parameters from a list of Issue labels.
 */
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
