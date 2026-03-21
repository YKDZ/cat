<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { onMounted, onUnmounted } from "vue";

import { useWorkflowStore } from "@/app/stores/workflow";

import type { Data } from "./+data.server.ts";

import WorkflowViewer from "./WorkflowViewer.vue";

const { runGraph, runId } = useData<Data>();
const workflowStore = useWorkflowStore();


workflowStore.applyRunGraph(runId, runGraph);


onMounted(async () => {
  await workflowStore.loadRun(runId);
  void workflowStore.subscribe(runId);
});


onUnmounted(() => {
  workflowStore.reset();
});
</script>

<template>
  <WorkflowViewer :initial-data="runGraph" :run-id="runId" />
</template>
