// elkjs/lib/elk.bundled.js is a self-contained UMD bundle with no external WASM deps
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import ELK from "elkjs/lib/elk.bundled.js";

import type {
  DagDirection,
  DagEdgeData,
  DagGraphData,
  DagNodeData,
  DagNodeType,
} from "./types";

const elk = new ELK();

export interface LayoutedNode {
  id: string;
  position: { x: number; y: number };
}

export interface LayoutedEdge {
  id: string;
  source: string;
  target: string;
}

export interface LayoutResult {
  nodes: LayoutedNode[];
  edges: LayoutedEdge[];
}

export const computeElkLayout = async (
  graph: DagGraphData,
  direction: DagDirection = "DOWN",
): Promise<LayoutResult> => {
  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "DOWN" ? "DOWN" : "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "40",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: graph.nodes.map((n) => ({
      id: n.id,
      width: 180,
      height: 60,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(elkGraph);

  const nodes: LayoutedNode[] =
    layout.children?.map((child) => ({
      id: child.id,
      position: {
        x: child.x ?? 0,
        y: child.y ?? 0,
      },
    })) ?? [];

  const edges: LayoutedEdge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  return { nodes, edges };
};

export const convertGraphDefinitionToData = (def: {
  nodes: Record<string, { id: string; type: string; label?: string }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    condition?: { description?: string };
  }>;
  entry: string;
  exit?: string[];
}): DagGraphData => {
  const dagNodeType = (type: string): DagNodeType => {
    const valid = [
      "llm",
      "tool",
      "router",
      "parallel",
      "join",
      "human_input",
      "transform",
      "loop",
      "subgraph",
    ] as const;
    return (valid as readonly string[]).includes(type)
      ? (type as DagNodeType)
      : "transform";
  };

  const nodes: DagNodeData[] = Object.values(def.nodes).map(
    (n) => ({
      id: n.id,
      label: n.label ?? n.id,
      type: dagNodeType(n.type),
      isEntry: n.id === def.entry,
      isExit: def.exit?.includes(n.id) ?? false,
    }),
  );

  const edges: DagEdgeData[] = def.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.label,
    condition: e.condition?.description,
  }));

  return { nodes, edges };
};
