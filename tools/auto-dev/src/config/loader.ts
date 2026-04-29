import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { IssueLabelConfig } from "../shared/types.js";
import type { AutoDevConfig, AgentRegistration } from "./types.js";

import { ConfigLoadError } from "../shared/errors.js";
import { AutoDevConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./types.js";

/**
 * Load and validate auto-dev configuration.
 */
export const loadConfig = async (
  workspaceRoot: string,
): Promise<AutoDevConfig> => {
  const candidates = [
    resolve(workspaceRoot, "auto-dev.config.ts"),
    resolve(workspaceRoot, "auto-dev.config.mjs"),
    resolve(workspaceRoot, "auto-dev.config.js"),
  ];
  const configPath = candidates.find(existsSync);

  if (!configPath) {
    console.warn(
      `[auto-dev] No auto-dev.config.{ts,mjs,js} found in ${workspaceRoot}, using built-in defaults.`,
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
    // When no agents are configured, inherit all defaults so the coordinator
    // always has at least one registered agent.
    agents:
      Object.keys(result.data.agents).length > 0
        ? result.data.agents
        : DEFAULT_CONFIG.agents,
    defaultAgent: result.data.defaultAgent,
    pollIntervalSec: result.data.pollIntervalSec,
    maxDecisionPerRun: result.data.maxDecisionPerRun,
    maxImplCycles: result.data.maxImplCycles,
  };

  // Validate agent definition files exist
  const agentsDir = process.env["AUTO_DEV_AGENTS_DIR"]
    ? resolve(workspaceRoot, process.env["AUTO_DEV_AGENTS_DIR"])
    : resolve(workspaceRoot, ".claude/agents");
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
  config.maxDecisionPerRun = Math.max(
    1,
    Math.min(100, config.maxDecisionPerRun),
  );
  config.maxImplCycles = Math.max(1, Math.min(50, config.maxImplCycles));

  return config;
};

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
        config.agentProvider = provider;
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
        config.agentEffort = effort;
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
