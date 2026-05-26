<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { computed, onMounted, onUnmounted } from "vue";

import { useWorkflowStore } from "@/stores/workflow";

import type { Data } from "./+data.server.ts";

import ProjectPageDataError from "../../ProjectPageDataError.vue";
import WorkflowViewer from "./WorkflowViewer.vue";

const data = useData<Data>();
const pageError = computed(() => data.pageError);
const runGraph = computed(() => data.runGraph ?? null);
const runId = computed(() => data.runId ?? null);
const workflowStore = useWorkflowStore();

if (runId.value && runGraph.value) {
  workflowStore.applyRunGraph(runId.value, runGraph.value);
}

onMounted(async () => {
  if (!runId.value) return;

  await workflowStore.loadRun(runId.value);
  void workflowStore.subscribe(runId.value);
});

onUnmounted(() => {
  workflowStore.reset();
});
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <WorkflowViewer
    v-else-if="runGraph && runId"
    :initial-data="runGraph"
    :run-id="runId"
  />
</template>
