import type { DagGraphData, DagNodeStatus } from "@cat/ui";
import type { AgentEvent } from "@cat/workflow";

import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import { orpc } from "@/rpc/orpc";
import { ws } from "@/rpc/ws";
import { convertGraphDefinition } from "@/utils/graph-convert";

type GraphDef = Parameters<typeof convertGraphDefinition>[0];
type RunGraphResult = {
  metadata: {
    status?: string;
    graphDefinition?: unknown;
  } | null;
  nodeStatuses: Record<string, string>;
};

const validNodeStatuses: readonly DagNodeStatus[] = [
  "pending",
  "running",
  "completed",
  "error",
  "paused",
];

const isDagNodeStatus = (s: string): s is DagNodeStatus =>
  (validNodeStatuses as readonly string[]).includes(s);

const isGraphDef = (val: unknown): val is GraphDef =>
  typeof val === "object" &&
  val !== null &&
  "nodes" in val &&
  "edges" in val &&
  "entry" in val;

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export const useWorkflowStore = defineStore("workflow", () => {
  const graph = shallowRef<DagGraphData | null>(null);
  const nodeStatuses = ref(new Map<string, DagNodeStatus>());
  const blackboard = ref<Record<string, unknown>>({});
  const blackboardVersion = ref(0);
  const eventLog = shallowRef<AgentEvent[]>([]);
  const runStatus = ref("pending");
  const selectedNodeId = ref<string | undefined>(undefined);
  const activeRunId = ref<string | null>(null);
  const isLoading = ref(false);

  const applyNodeStatus = (nodeId: string, status: DagNodeStatus): void => {
    nodeStatuses.value.set(nodeId, status);
    // Trigger reactivity by reassigning
    nodeStatuses.value = new Map(nodeStatuses.value);

    // Update graph node statuses
    if (graph.value) {
      graph.value = {
        ...graph.value,
        nodes: graph.value.nodes.map((n) =>
          n.id === nodeId ? { ...n, status } : n,
        ),
      };
    }
  };

  const handleEvent = (event: AgentEvent): void => {
    eventLog.value = [event, ...eventLog.value];

    switch (event.type) {
      case "run:start":
        runStatus.value = "running";
        break;
      case "run:pause":
        runStatus.value = "paused";
        break;
      case "run:resume":
        runStatus.value = "running";
        break;
      case "run:end": {
        const statusRaw = isRecord(event.payload)
          ? event.payload["status"]
          : null;
        runStatus.value =
          typeof statusRaw === "string" && statusRaw.length > 0
            ? statusRaw
            : "completed";
        const blackboardRaw = isRecord(event.payload)
          ? event.payload["blackboard"]
          : undefined;
        if (isRecord(blackboardRaw)) {
          blackboard.value = blackboardRaw;
          blackboardVersion.value += 1;
        }
        break;
      }
      case "run:error":
        runStatus.value = "failed";
        break;
      case "run:cancel":
        runStatus.value = "cancelled";
        break;
      case "node:start":
        if (event.nodeId) applyNodeStatus(event.nodeId, "running");
        break;
      case "node:end":
        if (event.nodeId) applyNodeStatus(event.nodeId, "completed");
        break;
      case "node:error":
        if (event.nodeId) applyNodeStatus(event.nodeId, "error");
        break;
      case "checkpoint:saved": {
        const snapshotRaw: unknown = isRecord(event.payload)
          ? event.payload["snapshot"]
          : undefined;
        if (isRecord(snapshotRaw)) {
          blackboard.value = snapshotRaw;
          blackboardVersion.value += 1;
        }
        break;
      }
      // These event types are handled by consumers of eventLog:
      case "run:compensation:start":
      case "run:compensation:end":
      case "node:retry":
      case "node:lease:acquired":
      case "node:lease:expired":
      case "node:lease:reclaimed":
      case "human:input:required":
      case "human:input:received":
      case "workflow:translation:created":
      case "workflow:qa:issue":
      case "workflow:suggestion:ready":
      case "tool:call":
      case "tool:result":
      case "llm:thinking":
      case "llm:complete":
        break;
    }
  };

  const applyRunGraph = (runId: string, result: RunGraphResult): void => {
    activeRunId.value = runId;
    runStatus.value = result.metadata?.status ?? "pending";

    nodeStatuses.value = new Map();
    for (const [nodeId, status] of Object.entries(result.nodeStatuses)) {
      if (isDagNodeStatus(status)) {
        nodeStatuses.value.set(nodeId, status);
      }
    }
    nodeStatuses.value = new Map(nodeStatuses.value);

    const graphDef = result.metadata?.graphDefinition;
    if (!isGraphDef(graphDef)) {
      graph.value = null;
      return;
    }

    const converted = convertGraphDefinition(graphDef);
    converted.nodes = converted.nodes.map((n) => ({
      ...n,
      status: isDagNodeStatus(result.nodeStatuses[n.id] ?? "")
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          (result.nodeStatuses[n.id] as DagNodeStatus)
        : n.status,
    }));

    graph.value = converted;
  };

  const loadRun = async (runId: string): Promise<void> => {
    isLoading.value = true;
    try {
      const result = await orpc.agent.getRunGraph({ runId });
      applyRunGraph(runId, result);
    } finally {
      isLoading.value = false;
    }
  };

  const subscribe = async (runId: string): Promise<void> => {
    try {
      for await (const event of await ws.agent.graphEvents({
        runId,
        includeHistory: eventLog.value.length === 0,
      })) {
        handleEvent(event);
      }
    } catch {
      // Subscription ended
    }
  };

  const pauseRun = async (runId: string): Promise<void> => {
    await orpc.agent.graphPause({ runId });
    runStatus.value = "paused";
  };

  const resumeRun = async (runId: string): Promise<void> => {
    await orpc.agent.graphResume({ runId });
    runStatus.value = "running";
  };

  const cancelRun = async (runId: string): Promise<void> => {
    await orpc.agent.graphCancel({ runId });
    runStatus.value = "cancelled";
  };

  const retryNode = async (runId: string, nodeId: string): Promise<void> => {
    await orpc.agent.retryNode({ runId, nodeId });
  };

  const reset = (): void => {
    graph.value = null;
    nodeStatuses.value = new Map();
    blackboard.value = {};
    blackboardVersion.value = 0;
    eventLog.value = [];
    runStatus.value = "pending";
    selectedNodeId.value = undefined;
    activeRunId.value = null;
  };

  return {
    graph,
    nodeStatuses,
    blackboard,
    blackboardVersion,
    eventLog,
    runStatus,
    selectedNodeId,
    activeRunId,
    isLoading,
    loadRun,
    subscribe,
    handleEvent,
    pauseRun,
    resumeRun,
    cancelRun,
    retryNode,
    applyRunGraph,
    reset,
  };
});
