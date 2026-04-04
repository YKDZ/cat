import type {
  DagEdgeData,
  DagGraphData,
  DagNodeData,
  DagNodeType,
} from "@cat/ui";
import type { GraphDefinition } from "@cat/workflow";

const validNodeTypes = [
  "llm",
  "tool",
  "router",
  "parallel",
  "join",
  "human_input",
  "transform",
  "loop",
  "subgraph",
] as const satisfies readonly DagNodeType[];

const toDagNodeType = (type: string): DagNodeType =>
  (validNodeTypes as readonly string[]).includes(type)
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (type as DagNodeType)
    : "transform";

export const convertGraphDefinition = (def: GraphDefinition): DagGraphData => {
  const nodes: DagNodeData[] = Object.values(def.nodes).map((n) => ({
    id: n.id,
    label: n.id,
    type: toDagNodeType(n.type),
    isEntry: n.id === def.entry,
    isExit: def.exit?.includes(n.id) ?? false,
  }));

  const edges: DagEdgeData[] = def.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.label,
    condition: e.condition?.description,
  }));

  return { nodes, edges };
};
