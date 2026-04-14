import type { DbHandle } from "@cat/domain";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createAgentDefinition: Symbol("createAgentDefinition"),
  findAgentDefinitionByDefinitionIdAndScope: Symbol(
    "findAgentDefinitionByDefinitionIdAndScope",
  ),
  updateAgentDefinition: Symbol("updateAgentDefinition"),
  executeCommand: vi.fn(),
  executeQuery: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  createAgentDefinition: mocked.createAgentDefinition,
  executeCommand: mocked.executeCommand,
  executeQuery: mocked.executeQuery,
  findAgentDefinitionByDefinitionIdAndScope:
    mocked.findAgentDefinitionByDefinitionIdAndScope,
  updateAgentDefinition: mocked.updateAgentDefinition,
}));

import { registerBuiltinAgents } from "./register-builtin-agents.ts";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const FAKE_DB = { tag: "db" } as unknown as DbHandle;

describe("registerBuiltinAgents", () => {
  beforeEach(() => {
    mocked.executeCommand.mockReset();
    mocked.executeQuery.mockReset();
  });

  it("creates the translator agent when no existing definition is found", async () => {
    mocked.executeQuery.mockResolvedValue(null);

    await registerBuiltinAgents(FAKE_DB);

    expect(mocked.executeQuery).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.findAgentDefinitionByDefinitionIdAndScope,
      { definitionId: "translator", scopeType: "GLOBAL", scopeId: "" },
    );
    expect(mocked.executeCommand).toHaveBeenCalledTimes(1);
    expect(mocked.executeCommand).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.createAgentDefinition,
      expect.objectContaining({
        definitionId: "translator",
        isBuiltin: true,
        tools: expect.arrayContaining(["submit_translation", "list_elements"]),
      }),
    );
  });

  it("updates existing definition on upgrade", async () => {
    mocked.executeQuery.mockResolvedValue({
      id: 42,
      externalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      definitionId: "translator",
      version: "0.9.0",
    });

    await registerBuiltinAgents(FAKE_DB);

    expect(mocked.executeCommand).toHaveBeenCalledTimes(1);
    expect(mocked.executeCommand).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.updateAgentDefinition,
      expect.objectContaining({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        definitionId: "translator",
        isBuiltin: true,
      }),
    );
  });
});
