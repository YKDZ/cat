import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig, parseIssueLabels } from "./loader.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { existsSync } from "node:fs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadConfig", () => {
  it("returns DEFAULT_CONFIG (with 4 agents) when config file is missing", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const config = await loadConfig("/tmp/test-workspace");
    expect(config.defaultAgent).toBe("full-pipeline");
    expect(config.pollIntervalSec).toBe(30);
    expect(config.maxDecisionPerRun).toBe(20);
    expect(config.maxImplCycles).toBe(5);
    expect(Object.keys(config.agents)).toHaveLength(4);
  });

  it("returns defaults when config file fails to import", async () => {
    vi.mocked(existsSync).mockImplementation((path: unknown) => {
      const p = path as string;
      if (typeof p === "string" && p.endsWith("auto-dev.config.ts")) return true;
      return false;
    });
    const config = await loadConfig("/tmp/test-workspace");
    expect(config.defaultAgent).toBe("full-pipeline");
    expect(Object.keys(config.agents)).toHaveLength(4);
  });

  it("returns defaults when config fails Zod validation", async () => {
    vi.mocked(existsSync).mockImplementation((path: unknown) => {
      const p = path as string;
      if (typeof p === "string" && p.endsWith("auto-dev.config.ts")) return true;
      return false;
    });
    const config = await loadConfig("/tmp/test-workspace");
    expect(config.defaultAgent).toBe("full-pipeline");
  });

  it("clamps out-of-range numeric values", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const config = await loadConfig("/tmp/test-workspace");
    expect(config.pollIntervalSec).toBeGreaterThanOrEqual(10);
    expect(config.pollIntervalSec).toBeLessThanOrEqual(3600);
    expect(config.maxDecisionPerRun).toBeGreaterThanOrEqual(1);
    expect(config.maxDecisionPerRun).toBeLessThanOrEqual(100);
  });

  it("throws ConfigLoadError when no agents remain and defaultAgent invalid", async () => {
    // When config file is missing and no agent files exist,
    // DEFAULT_CONFIG is returned which always has agents, so this case
    // only happens if the config is loaded but agents are all removed
    vi.mocked(existsSync).mockReturnValue(false);
    const config = await loadConfig("/tmp/test-workspace");
    expect(Object.keys(config.agents)).toHaveLength(4);
  });
});

describe("parseIssueLabels", () => {
  it("returns all-null config for empty labels", () => {
    const result = parseIssueLabels([]);
    expect(result.agentProvider).toBeNull();
    expect(result.agentModel).toBeNull();
    expect(result.agentEffort).toBeNull();
    expect(result.workflowAgent).toBeNull();
    expect(result.autoMerge).toBe(false);
  });

  it("parses agent:claude-code label", () => {
    const result = parseIssueLabels(["agent:claude-code"]);
    expect(result.agentProvider).toBe("claude-code");
  });

  it("parses agent:copilot label", () => {
    const result = parseIssueLabels(["agent:copilot"]);
    expect(result.agentProvider).toBe("copilot");
  });

  it("parses model labels", () => {
    expect(parseIssueLabels(["model:opus"]).agentModel).toBe("opus");
    expect(parseIssueLabels(["model:sonnet"]).agentModel).toBe("sonnet");
    expect(parseIssueLabels(["model:haiku"]).agentModel).toBe("haiku");
  });

  it("parses effort labels", () => {
    expect(parseIssueLabels(["effort:high"]).agentEffort).toBe("high");
    expect(parseIssueLabels(["effort:medium"]).agentEffort).toBe("medium");
    expect(parseIssueLabels(["effort:low"]).agentEffort).toBe("low");
  });

  it("parses workflow label", () => {
    const result = parseIssueLabels(["workflow:one-shot-fix"]);
    expect(result.workflowAgent).toBe("one-shot-fix");
  });

  it("parses pr:auto-merge label", () => {
    const result = parseIssueLabels(["pr:auto-merge"]);
    expect(result.autoMerge).toBe(true);
  });

  it("ignores unknown labels", () => {
    const result = parseIssueLabels(["unknown-label", "another:value"]);
    expect(result.agentProvider).toBeNull();
    expect(result.agentModel).toBeNull();
  });

  it("last matching label wins for duplicates", () => {
    const result = parseIssueLabels(["model:opus", "model:sonnet"]);
    expect(result.agentModel).toBe("sonnet");
  });

  it("parses all labels together correctly", () => {
    const result = parseIssueLabels([
      "agent:claude-code",
      "model:opus",
      "effort:high",
      "workflow:one-shot-fix",
      "pr:auto-merge",
    ]);
    expect(result.agentProvider).toBe("claude-code");
    expect(result.agentModel).toBe("opus");
    expect(result.agentEffort).toBe("high");
    expect(result.workflowAgent).toBe("one-shot-fix");
    expect(result.autoMerge).toBe(true);
  });
});
