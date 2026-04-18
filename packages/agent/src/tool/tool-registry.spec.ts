import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type {
  AgentToolDefinition,
  ToolExecutionContext,
} from "./tool-types.ts";

import { ToolRegistry } from "./tool-registry.ts";

const mockCtx: ToolExecutionContext = {
  session: { sessionId: "s1", agentId: "a1", projectId: "p1", runId: "r1" },
  permissions: {
    checkPermission: vi.fn().mockResolvedValue(true),
  },
  cost: { budgetId: "b1", remainingTokens: 10_000 },
  vcsMode: "direct",
};

const makeTool = (
  name: string,
  execute?: AgentToolDefinition["execute"],
): AgentToolDefinition => ({
  name,
  description: `Tool ${name}`,
  parameters: z.object({ input: z.string() }),
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  execute: execute ?? vi.fn().mockResolvedValue({ ok: true }),
});

describe("ToolRegistry", () => {
  it("registers and resolves tools by name", () => {
    const registry = new ToolRegistry();
    const toolA = makeTool("toolA");
    const toolB = makeTool("toolB");

    registry.register(toolA);
    registry.register(toolB);

    expect(registry.resolve(["toolA"])).toHaveLength(1);
    expect(registry.resolve(["toolA"])[0]?.name).toBe("toolA");
    expect(registry.resolve(["toolA", "toolB"])).toHaveLength(2);
  });

  it("ignores unregistered tool names in resolve()", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("toolA"));

    const result = registry.resolve(["toolA", "unknown"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("toolA");
  });

  it("overwrites a tool when registered with the same name", () => {
    const registry = new ToolRegistry();
    const first = makeTool("tool", vi.fn().mockResolvedValue("first"));
    const second = makeTool("tool", vi.fn().mockResolvedValue("second"));

    registry.register(first);
    registry.register(second);

    expect(registry.size).toBe(1);
    expect(registry.resolve(["tool"])[0]).toBe(second);
  });

  it("executes a tool and returns its result", async () => {
    const execute = vi.fn().mockResolvedValue({ translated: "hello" });
    const registry = new ToolRegistry();
    registry.register(makeTool("translate", execute));

    const result = await registry.execute(
      "translate",
      { input: "hi" },
      mockCtx,
    );
    expect(result).toEqual({ translated: "hello" });
    expect(execute).toHaveBeenCalledWith({ input: "hi" }, mockCtx);
  });

  it("throws when executing an unregistered tool", async () => {
    const registry = new ToolRegistry();
    await expect(
      registry.execute("missing", { input: "x" }, mockCtx),
    ).rejects.toThrow('Tool "missing" is not registered');
  });

  it("validates arguments against Zod schema before executing", async () => {
    const execute = vi.fn().mockResolvedValue("ok");
    const registry = new ToolRegistry();
    registry.register(makeTool("tool", execute));

    // Valid args — should work
    await registry.execute("tool", { input: "valid" }, mockCtx);
    expect(execute).toHaveBeenCalledOnce();

    // Invalid args — should throw ZodError before reaching execute
    execute.mockClear();
    await expect(
      registry.execute("tool", { input: 123 }, mockCtx),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("converts tools to LLM JSON Schema format via toLLMTools()", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("toolA"));
    registry.register(makeTool("toolB"));

    const llmTools = registry.toLLMTools(["toolA", "toolB"]);
    expect(llmTools).toHaveLength(2);

    const toolADef = llmTools[0];
    expect(toolADef?.name).toBe("toolA");
    expect(toolADef?.description).toBe("Tool toolA");
    expect(typeof toolADef?.parameters).toBe("object");
    // JSON Schema shape
    expect(toolADef?.parameters).toMatchObject({ type: "object" });
  });

  it("size reflects the number of registered tools", () => {
    const registry = new ToolRegistry();
    expect(registry.size).toBe(0);
    registry.register(makeTool("a"));
    expect(registry.size).toBe(1);
    registry.register(makeTool("b"));
    expect(registry.size).toBe(2);
  });
});
