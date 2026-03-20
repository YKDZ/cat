<script setup lang="ts">
import {
  DagGraph,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cat/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useWorkflowStore } from "@/app/stores/workflow";

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
  <div class="flex h-full flex-col">
    <!-- Header -->
    <WorkflowHeader
      :run-id="props.runId"
      :direction="direction"
      @update:direction="direction = $event"
    />

    <!-- Body -->
    <ResizablePanelGroup direction="vertical" class="min-h-0 flex-1">
      <!-- Top: Graph + Node Detail -->
      <ResizablePanel :default-size="65" :min-size="30">
        <ResizablePanelGroup direction="horizontal">
          <!-- DAG Graph -->
          <ResizablePanel
            :default-size="showNodeDetail ? 60 : 100"
            :min-size="30"
          >
            <div v-if="graph" class="size-full">
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
          </ResizablePanel>

          <!-- Node Detail Panel -->
          <template v-if="showNodeDetail && workflowStore.selectedNodeId">
            <ResizableHandle />
            <ResizablePanel :default-size="40" :min-size="25" :max-size="60">
              <NodeDetailPanel
                :run-id="props.runId"
                :node-id="workflowStore.selectedNodeId"
                @close="handleCloseNodeDetail"
              />
            </ResizablePanel>
          </template>
        </ResizablePanelGroup>
      </ResizablePanel>

      <!-- Bottom: Blackboard + Event Log -->
      <ResizableHandle />
      <ResizablePanel :default-size="35" :min-size="15" :max-size="60">
        <Tabs default-value="events" class="flex h-full flex-col">
          <div class="shrink-0 border-b px-4 pt-2">
            <TabsList>
              <TabsTrigger value="blackboard">{{ t("黑板状态") }}</TabsTrigger>
              <TabsTrigger value="events">{{ t("事件日志") }}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="blackboard" class="mt-0 min-h-0 flex-1">
            <BlackboardPanel />
          </TabsContent>
          <TabsContent value="events" class="mt-0 min-h-0 flex-1">
            <EventLogPanel />
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
