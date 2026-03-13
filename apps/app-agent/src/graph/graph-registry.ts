import type { GraphDefinition } from "@/graph/types";

import { GraphDefinitionSchema } from "@/graph/types";

export class GraphRegistry {
  private graphs = new Map<string, GraphDefinition>();

  register = (graphLike: GraphDefinition): GraphDefinition => {
    const graph = GraphDefinitionSchema.parse(graphLike);
    if (this.graphs.has(graph.id)) {
      throw new Error(`Graph already registered: ${graph.id}`);
    }
    this.graphs.set(graph.id, graph);
    return graph;
  };

  get = (graphId: string): GraphDefinition => {
    const graph = this.graphs.get(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    return graph;
  };

  has = (graphId: string): boolean => {
    return this.graphs.has(graphId);
  };

  list = (): GraphDefinition[] => {
    return [...this.graphs.values()];
  };
}
