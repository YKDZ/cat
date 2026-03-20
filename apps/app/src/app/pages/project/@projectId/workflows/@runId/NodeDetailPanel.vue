<script setup lang="ts">
import {
  Badge,
  Button,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cat/ui";
import {
  ArrowRightLeft,
  Brain,
  GitBranch,
  GitFork,
  GitMerge,
  Layers,
  RefreshCw,
  Repeat,
  UserRound,
  Wrench,
  X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import JsonViewer from "@/app/components/JsonViewer.vue";
import { orpc } from "@/app/rpc/orpc";
import { useWorkflowStore } from "@/app/stores/workflow";

const props = defineProps<{
  runId: string;
  nodeId: string;
}>();


const emit = defineEmits<{
  close: [];
}>();


const { t } = useI18n();
const workflowStore = useWorkflowStore();


const nodeDetail = ref<{
  nodeId: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  events: Array<{
    eventId: string;
    type: string;
    nodeId: string | null;
    payload: unknown;
    timestamp: Date;
  }>;
} | null>(null);


const isLoading = ref(false);


const nodeData = computed(() =>
  workflowStore.graph?.nodes.find((n) => n.id === props.nodeId),
);


const iconMap: Record<string, typeof Brain> = {
  llm: Brain,
  tool: Wrench,
  router: GitBranch,
  parallel: GitFork,
  join: GitMerge,
  human_input: UserRound,
  transform: ArrowRightLeft,
  loop: Repeat,
  subgraph: Layers,
};


const nodeIcon = computed(() => iconMap[nodeData.value?.type ?? "transform"]);
const nodeStatus = computed(
  () => workflowStore.nodeStatuses.get(props.nodeId) ?? nodeData.value?.status,
);


const badgeVariant = computed((): "secondary" | "outline" | "destructive" => {
  if (nodeStatus.value === "error") return "destructive";
  if (nodeStatus.value === "completed") return "secondary";
  return "outline";
});


const loadDetail = async (): Promise<void> => {
  isLoading.value = true;
  try {
    const result = await orpc.agent.getNodeDetail({
      runId: props.runId,
      nodeId: props.nodeId,
    });
    nodeDetail.value = result;
  } finally {
    isLoading.value = false;
  }
};


watch(
  () => props.nodeId,
  () => {
    void loadDetail();
  },
  { immediate: true },
);


const handleRetry = async (): Promise<void> => {
  await workflowStore.retryNode(props.runId, props.nodeId);
};
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2">
        <component :is="nodeIcon" class="size-4 text-muted-foreground" />
        <span class="text-sm font-medium">{{ props.nodeId }}</span>
        <Badge
          v-if="nodeStatus"
          :variant="badgeVariant"
          class="h-4 px-1 text-[10px]"
        >
          {{ t(nodeStatus) }}
        </Badge>
      </div>
      <Button variant="ghost" size="icon" class="size-7" @click="emit('close')">
        <X class="size-4" />
      </Button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <div
        class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
    </div>

    <!-- Content -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <Tabs default-value="input" class="flex min-h-0 flex-1 flex-col">
        <TabsList class="mx-4 mt-2 shrink-0">
          <TabsTrigger value="input">{{ t("输入") }}</TabsTrigger>
          <TabsTrigger value="output">{{ t("输出") }}</TabsTrigger>
          <TabsTrigger value="events">{{ t("事件") }}</TabsTrigger>
        </TabsList>

        <TabsContent value="input" class="min-h-0 flex-1 p-4">
          <JsonViewer :value="nodeDetail?.input ?? null" class="h-full" />
        </TabsContent>

        <TabsContent value="output" class="min-h-0 flex-1 p-4">
          <JsonViewer :value="nodeDetail?.output ?? null" class="h-full" />
        </TabsContent>

        <TabsContent value="events" class="min-h-0 flex-1 p-2">
          <ScrollArea class="h-full">
            <div class="space-y-1 p-2">
              <div
                v-for="event in nodeDetail?.events ?? []"
                :key="event.eventId"
                class="rounded border p-2 text-xs"
              >
                <div class="mb-1 flex items-center gap-2">
                  <Badge variant="outline" class="h-4 px-1 text-[10px]">{{
                    event.type
                  }}</Badge>
                  <span class="text-muted-foreground">
                    {{ new Date(event.timestamp).toLocaleTimeString() }}
                  </span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <!-- Error + retry -->
      <div
        v-if="nodeStatus === 'error'"
        class="mx-4 mb-4 shrink-0 rounded border border-destructive/50 bg-destructive/5 p-3"
      >
        <p class="mb-2 text-sm text-destructive">
          {{ String(nodeDetail?.error ?? t("未知错误")) }}
        </p>
        <Button size="sm" variant="outline" @click="handleRetry">
          <RefreshCw class="mr-1 size-4" />
          {{ t("重试") }}
        </Button>
      </div>
    </div>
  </div>
</template>
