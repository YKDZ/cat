import { describe, expect, it, vi } from "vitest";

import type { DagGraphData } from "../types";

import { computeElkLayout, convertGraphDefinitionToData } from "../layout";

// Mock elkjs to avoid heavy WebWorker or WASM in unit env
vi.mock("elkjs/lib/elk.bundled.js", () => {
  class MockELK {
    layout(elkGraph: { children: Array<{ id: string }>; edges: unknown[] }) {
      return Promise.resolve({
        children: elkGraph.children.map((c, i) => ({
          id: c.id,
          x: i * 200,
          y: 0,
        })),
        edges: elkGraph.edges,
      });
    }
  }
  return { default: MockELK };
});

const sampleGraph: DagGraphData = {
  nodes: [
    { id: "a", label: "A", type: "llm", isEntry: true, isExit: false },
    { id: "b", label: "B", type: "tool", isEntry: false, isExit: true },
  ],
  edges: [{ id: "e-a-b-0", source: "a", target: "b" }],
};

describe("computeElkLayout", () => {
  it("returns layouted nodes with positions", async () => {
    const result = await computeElkLayout(sampleGraph, "DOWN");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({ id: "a" });
    expect(result.nodes[0]?.position).toBeDefined();
  });

  it("returns edges preserving source/target", async () => {
    const result = await computeElkLayout(sampleGraph, "RIGHT");
    expect(result.edges[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("defaults to DOWN direction", async () => {
    const result = await computeElkLayout(sampleGraph);
    expect(result.nodes).toHaveLength(2);
  });
});

describe("convertGraphDefinitionToData", () => {
  const def = {
    nodes: {
      start: { id: "start", type: "llm", label: "Start" },
      end: { id: "end", type: "tool" },
    },
    edges: [{ from: "start", to: "end", label: "next" }],
    entry: "start",
    exit: ["end"],
  };

  it("maps nodes correctly", () => {
    const data = convertGraphDefinitionToData(def);
    expect(data.nodes).toHaveLength(2);
    const startNode = data.nodes.find((n) => n.id === "start");
    expect(startNode?.isEntry).toBe(true);
    expect(startNode?.label).toBe("Start");
  });

  it("marks exit nodes", () => {
    const data = convertGraphDefinitionToData(def);
    const endNode = data.nodes.find((n) => n.id === "end");
    expect(endNode?.isExit).toBe(true);
  });

  it("maps edges with generated ids", () => {
    const data = convertGraphDefinitionToData(def);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]?.source).toBe("start");
    expect(data.edges[0]?.target).toBe("end");
    expect(data.edges[0]?.label).toBe("next");
  });

  it("uses unknown type as transform fallback", () => {
    const d = {
      nodes: { n: { id: "n", type: "unknown_custom_type" } },
      edges: [],
      entry: "n",
    };
    const data = convertGraphDefinitionToData(d);
    expect(data.nodes[0]?.type).toBe("transform");
  });
});
