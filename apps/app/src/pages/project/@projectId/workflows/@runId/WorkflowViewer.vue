<script setup lang="ts">
import { DagGraph, Tabs, TabsContent, TabsList, TabsTrigger } from "@cat/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useWorkflowStore } from "@/stores/workflow";

import BlackboardPanel from "./BlackboardPanel.vue";
import EventLogPanel from "./EventLogPanel.vue";
import NodeDetailPanel from "./NodeDetailPanel.vue";
import WorkflowHeader from "./WorkflowHeader.vue";

const props = defineProps<{
  runId: string;
  initialData: {
    metadata: {
      status: string;
      graphDefinition: unknown;
      currentNodeId: string | null;
      startedAt: Date;
      completedAt: Date | null;
    } | null;
    nodeStatuses: Record<string, string>;
  };
}>();

const { t } = useI18n();
const workflowStore = useWorkflowStore();

const direction = ref<"DOWN" | "RIGHT">("RIGHT");
const showNodeDetail = computed(() => !!workflowStore.selectedNodeId);

const graph = computed(() => workflowStore.graph);

const handleNodeClick = (nodeId: string): void => {
  workflowStore.selectedNodeId = nodeId;
};

const handleCloseNodeDetail = (): void => {
  workflowStore.selectedNodeId = undefined;
};
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-auto">
    <!-- Header -->
    <WorkflowHeader
      :run-id="props.runId"
      :direction="direction"
      @update:direction="direction = $event"
    />

    <!-- Body -->
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <!-- Top: Graph + Node Detail -->
      <div class="flex min-h-100 gap-4">
        <!-- DAG Graph -->
        <div
          :class="[
            'min-h-0 min-w-0 transition-all duration-200',
            showNodeDetail ? 'flex-3' : 'flex-1',
          ]"
        >
          <div v-if="graph" class="size-full border bg-background">
            <DagGraph
              :graph="graph"
              :selected-node-id="workflowStore.selectedNodeId"
              :direction="direction"
              @node-click="handleNodeClick"
              @update:selected-node-id="workflowStore.selectedNodeId = $event"
            />
          </div>
          <div v-else class="flex size-full items-center justify-center">
            <div
              class="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
          </div>
        </div>

        <!-- Node Detail Panel -->
        <div
          v-if="showNodeDetail && workflowStore.selectedNodeId"
          class="min-h-0 w-100 max-w-200 min-w-75 resize-x overflow-hidden"
        >
          <NodeDetailPanel
            :run-id="props.runId"
            :node-id="workflowStore.selectedNodeId"
            @close="handleCloseNodeDetail"
          />
        </div>
      </div>

      <!-- Bottom: Blackboard + Event Log -->
      <div class="min-h-128 flex-1">
        <Tabs
          default-value="events"
          class="flex h-full flex-col border bg-background"
        >
          <div class="shrink-0 border-b px-4 py-2">
            <TabsList>
              <TabsTrigger value="blackboard">{{ t("黑板状态") }}</TabsTrigger>
              <TabsTrigger value="events">{{ t("事件日志") }}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="blackboard"
            class="mt-0 min-h-0 flex-1 overflow-auto"
          >
            <BlackboardPanel />
          </TabsContent>
          <TabsContent value="events" class="mt-0 min-h-0 flex-1 overflow-auto">
            <EventLogPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  </div>
</template>
