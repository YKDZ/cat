import { defineStore } from "pinia";
import { ref } from "vue";

import { orpc } from "#/rpc/orpc.ts";

type ServerFlowState = Awaited<ReturnType<typeof orpc.authFlow.initFlow>>;
type FlowStatus = "idle" | ServerFlowState["status"];
type CurrentNode = ServerFlowState["currentNode"];
type FlowError = ServerFlowState["error"];

export const useAuthFlowStore = defineStore("auth-flow", () => {
  const flowId = ref<string | null>(null);
  const status = ref<FlowStatus>("idle");
  const currentNode = ref<CurrentNode>(null);
  const progress = ref({ completedSteps: 0, totalEstimatedSteps: 1 });
  const error = ref<FlowError>(undefined);
  const sessionCreated = ref(false);
  const loading = ref(false);

  const applyState = (state: ServerFlowState): void => {
    flowId.value = state.flowId;
    status.value = state.status;
    currentNode.value = state.currentNode;
    progress.value = state.progress;
    error.value = state.error;
    sessionCreated.value = state.sessionCreated ?? false;
  };

  const initFlow = async (flowType: "login" | "register"): Promise<void> => {
    loading.value = true;
    error.value = undefined;
    try {
      const state = await orpc.authFlow.initFlow({ flowType });
      applyState(state);
    } finally {
      loading.value = false;
    }
  };

  const advanceFlow = async (
    input?: Record<string, unknown>,
  ): Promise<void> => {
    if (!flowId.value) return;
    loading.value = true;
    error.value = undefined;
    try {
      const state = await orpc.authFlow.advanceFlow({
        flowId: flowId.value,
        input,
      });
      applyState(state);
    } finally {
      loading.value = false;
    }
  };

  const refreshState = async (): Promise<void> => {
    if (!flowId.value) return;
    const state = await orpc.authFlow.getFlowState({ flowId: flowId.value });
    if (state) applyState(state);
  };

  const reset = (): void => {
    flowId.value = null;
    status.value = "idle";
    currentNode.value = null;
    progress.value = { completedSteps: 0, totalEstimatedSteps: 1 };
    error.value = undefined;
    sessionCreated.value = false;
    loading.value = false;
  };

  return {
    flowId,
    status,
    currentNode,
    progress,
    error,
    sessionCreated,
    loading,
    initFlow,
    advanceFlow,
    refreshState,
    reset,
  };
});
