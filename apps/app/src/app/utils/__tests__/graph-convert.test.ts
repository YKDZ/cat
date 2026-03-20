import { describe, expect, it } from "vitest";

import { convertGraphDefinition } from "@/app/utils/graph-convert";

// Minimal valid GraphDefinition objects (matching @cat/agent types)
const makeNode = (id: string, type: string) => ({
  id,
  type,
  timeoutMs: 120_000,
});

describe("convertGraphDefinition", () => {
  it("converts nodes with correct fields", () => {
    const def = {
      id: "test-graph",
      nodes: {
        n1: makeNode("n1", "llm"),
        n2: makeNode("n2", "router"),
      },
      edges: [{ from: "n1", to: "n2" }],
      entry: "n1",
      exit: ["n2"],
    };

    const result = convertGraphDefinition(def);

    expect(result.nodes).toHaveLength(2);

    const n1 = result.nodes.find((n) => n.id === "n1");
    expect(n1).toBeDefined();
    expect(n1?.isEntry).toBe(true);
    expect(n1?.isExit).toBe(false);
    expect(n1?.label).toBe("n1");
    expect(n1?.type).toBe("llm");

    const n2 = result.nodes.find((n) => n.id === "n2");
    expect(n2?.isExit).toBe(true);
    expect(n2?.label).toBe("n2");
  });

  it("converts edges with source/target", () => {
    const def = {
      id: "test-graph",
      nodes: {
        a: makeNode("a", "tool"),
        b: makeNode("b", "tool"),
      },
      edges: [
        {
          from: "a",
          to: "b",
          condition: {
            type: "expression" as const,
            value: "result == true",
            description: "if success",
          },
        },
      ],
      entry: "a",
    };

    const result = convertGraphDefinition(def);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.source).toBe("a");
    expect(result.edges[0]?.target).toBe("b");
    expect(result.edges[0]?.condition).toBe("if success");
  });

  it("handles empty edges", () => {
    const def = {
      id: "test-graph",
      nodes: { only: makeNode("only", "llm") },
      edges: [],
      entry: "only",
    };
    const result = convertGraphDefinition(def);
    expect(result.edges).toHaveLength(0);
  });

  it("applies transform fallback for unknown types", () => {
    const unknownTypeNode = {
      id: "x",
      type: "my_custom_type",
      timeoutMs: 120_000,
    };
    const def = {
      id: "test-graph",
      nodes: { x: unknownTypeNode },
      edges: [],
      entry: "x",
    };
    const result = convertGraphDefinition(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      def as unknown as Parameters<typeof convertGraphDefinition>[0],
    );
    expect(result.nodes[0]?.type).toBe("transform");
  });

  it("generates unique edge ids for multiple edges", () => {
    const def = {
      id: "test-graph",
      nodes: {
        a: makeNode("a", "router"),
        b: makeNode("b", "tool"),
        c: makeNode("c", "tool"),
      },
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
      entry: "a",
    };
    const result = convertGraphDefinition(def);
    const ids = result.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});
