import { describe, it, expect } from "vitest";
import { parseIssueLabels, parseAtMentionAgent, resolveAgentDefinition } from "./label-parser.js";
import { DEFAULT_CONFIG } from "../config/types.js";

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
    expect(parseIssueLabels(["agent:claude-code"]).agentProvider).toBe("claude-code");
  });

  it("parses agent:copilot label", () => {
    expect(parseIssueLabels(["agent:copilot"]).agentProvider).toBe("copilot");
  });

  it("parses model:opus/sonnet/haiku labels", () => {
    expect(parseIssueLabels(["model:opus"]).agentModel).toBe("opus");
    expect(parseIssueLabels(["model:sonnet"]).agentModel).toBe("sonnet");
    expect(parseIssueLabels(["model:haiku"]).agentModel).toBe("haiku");
  });

  it("parses effort:high/medium/low labels", () => {
    expect(parseIssueLabels(["effort:high"]).agentEffort).toBe("high");
    expect(parseIssueLabels(["effort:medium"]).agentEffort).toBe("medium");
    expect(parseIssueLabels(["effort:low"]).agentEffort).toBe("low");
  });

  it("parses workflow label", () => {
    expect(parseIssueLabels(["workflow:one-shot-fix"]).workflowAgent).toBe("one-shot-fix");
  });

  it("parses pr:auto-merge label", () => {
    expect(parseIssueLabels(["pr:auto-merge"]).autoMerge).toBe(true);
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

  it("handles all labels together", () => {
    const result = parseIssueLabels([
      "agent:claude-code", "model:opus", "effort:high",
      "workflow:one-shot-fix", "pr:auto-merge",
    ]);
    expect(result.agentProvider).toBe("claude-code");
    expect(result.agentModel).toBe("opus");
    expect(result.agentEffort).toBe("high");
    expect(result.workflowAgent).toBe("one-shot-fix");
    expect(result.autoMerge).toBe(true);
  });
});

describe("parseAtMentionAgent", () => {
  it("extracts agent name from @auto-dev mention", () => {
    expect(parseAtMentionAgent("Do work @auto-dev one-shot-fix please")).toBe("one-shot-fix");
  });

  it("returns null when no @-mention", () => {
    expect(parseAtMentionAgent("Just a normal issue body")).toBeNull();
  });
});

describe("resolveAgentDefinition", () => {
  it("label priority wins over @-mention", () => {
    const labels = parseIssueLabels(["workflow:one-shot-fix"]);
    const body = "@auto-dev full-pipeline";
    const result = resolveAgentDefinition(labels, body, DEFAULT_CONFIG);
    expect(result).toBe("one-shot-fix");
  });

  it("@-mention wins over default", () => {
    const labels = parseIssueLabels([]);
    const body = "@auto-dev spec-only";
    const result = resolveAgentDefinition(labels, body, DEFAULT_CONFIG);
    expect(result).toBe("spec-only");
  });

  it("falls back to default when both label and @-mention are invalid", () => {
    const labels = parseIssueLabels(["workflow:nonexistent"]);
    const body = "@auto-dev also-nonexistent";
    const result = resolveAgentDefinition(labels, body, DEFAULT_CONFIG);
    expect(result).toBe("full-pipeline");
  });
});
