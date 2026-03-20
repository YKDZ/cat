<script setup lang="ts">
/**
 * @shadcn-custom-component
 * description: Main DAG graph viewer using Vue Flow + ELK layout engine
 * lastReviewed: 2026-03-20
 */
import {
  VueFlow,
  useVueFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import { ref, watch, shallowRef } from "vue";

import type {
  DagDirection,
  DagEdgeData,
  DagGraphData,
  DagNodeData,
  DagNodeStatus,
} from "./types";

import DagControls from "./DagControls.vue";
import DagEdge from "./DagEdge.vue";
import DagMinimap from "./DagMinimap.vue";
import DagNode from "./DagNode.vue";
import { computeElkLayout } from "./layout";

const props = withDefaults(
  defineProps<{
    graph: DagGraphData;
    selectedNodeId?: string;
    direction?: DagDirection;
    interactive?: boolean;
    fitViewOnInit?: boolean;
  }>(),
  {
    direction: "DOWN",
    interactive: true,
    fitViewOnInit: true,
  },
);


const emit = defineEmits<{
  "update:selectedNodeId": [nodeId: string | undefined];
  nodeClick: [nodeId: string];
  nodeDoubleClick: [nodeId: string];
}>();


const nodeTypes = { "dag-node": DagNode };
const edgeTypes = { "dag-edge": DagEdge };


const nodes = shallowRef<FlowNode[]>([]);
const edges = shallowRef<FlowEdge[]>([]);
const isLayouting = ref(false);


const { fitView, onNodeClick, onNodeDoubleClick } = useVueFlow();


// Track previous node set to detect topology changes
let prevNodeIds = new Set<string>();
let prevEdgeIds = new Set<string>();


const buildFlowNodes = (
  dagNodes: DagNodeData[],
  positionMap: Map<string, { x: number; y: number }>,
): FlowNode[] =>
  dagNodes.map((n) => ({
    id: n.id,
    type: "dag-node",
    position: positionMap.get(n.id) ?? { x: 0, y: 0 },
    data: { ...n },
    selected: n.id === props.selectedNodeId,
  }));


const buildFlowEdges = (dagEdges: DagEdgeData[]): FlowEdge[] =>
  dagEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "dag-edge",
    animated: e.animated ?? false,
    data: e,
    label: e.label,
  }));


const topologyChanged = (graph: DagGraphData): boolean => {
  const newNodeIds = new Set(graph.nodes.map((n) => n.id));
  const newEdgeIds = new Set(graph.edges.map((e) => e.id));
  if (
    newNodeIds.size !== prevNodeIds.size ||
    newEdgeIds.size !== prevEdgeIds.size
  )
    return true;
  for (const id of newNodeIds) if (!prevNodeIds.has(id)) return true;
  for (const id of newEdgeIds) if (!prevEdgeIds.has(id)) return true;
  return false;
};


const updateStatusOnly = (graph: DagGraphData): void => {
  nodes.value = nodes.value.map((node) => {
    const updated = graph.nodes.find((n) => n.id === node.id);
    if (!updated) return node;
    return {
      ...node,
      data: { ...updated },
      selected: node.id === props.selectedNodeId,
    };
  });
  edges.value = buildFlowEdges(graph.edges);
};


const relayout = async (graph: DagGraphData): Promise<void> => {
  if (isLayouting.value) return;
  isLayouting.value = true;
  try {
    const result = await computeElkLayout(graph, props.direction);
    const positionMap = new Map(result.nodes.map((n) => [n.id, n.position]));
    nodes.value = buildFlowNodes(graph.nodes, positionMap);
    edges.value = buildFlowEdges(graph.edges);
    prevNodeIds = new Set(graph.nodes.map((n) => n.id));
    prevEdgeIds = new Set(graph.edges.map((e) => e.id));
    if (props.fitViewOnInit) {
      setTimeout(() => fitView(), 50);
    }
  } finally {
    isLayouting.value = false;
  }
};


watch(
  () => props.graph,
  async (graph) => {
    if (topologyChanged(graph)) {
      await relayout(graph);
    } else {
      updateStatusOnly(graph);
    }
  },
  { deep: true, immediate: true },
);


watch(
  () => props.direction,
  async () => {
    await relayout(props.graph);
  },
);


onNodeClick(({ node }) => {
  emit("update:selectedNodeId", node.id);
  emit("nodeClick", node.id);
});


onNodeDoubleClick(({ node }) => {
  emit("nodeDoubleClick", node.id);
});


// Update node selection when selectedNodeId changes from parent
watch(
  () => props.selectedNodeId,
  (newId) => {
    nodes.value = nodes.value.map((node) => ({
      ...node,
      selected: node.id === newId,
    }));
  },
);
</script>

<template>
  <div class="relative size-full">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :nodes-connectable="false"
      :nodes-draggable="interactive"
      :zoom-on-scroll="interactive"
      :pan-on-drag="interactive"
      fit-view-on-init
      class="size-full"
    >
      <DagMinimap />
      <DagControls />
    </VueFlow>

    <!-- Loading overlay -->
    <div
      v-if="isLayouting"
      class="absolute inset-0 flex items-center justify-center bg-background/50"
    >
      <div
        class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
    </div>
  </div>
</template>
