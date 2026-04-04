<script setup lang="ts">
import { Badge } from "@cat/ui";
import { Wrench } from "@lucide/vue";
import { useI18n } from "vue-i18n";

import type { NodeExecution } from "@/app/types/agent-graph";

import AgentNodeStatusBadge from "./AgentNodeStatusBadge.vue";
import AgentToolCallCard from "./AgentToolCallCard.vue";

defineProps<{
  nodes: NodeExecution[];
}>();

const { t } = useI18n();

const formatTime = (value: Date | null): string => {
  if (!value) return "-";
  return value.toLocaleTimeString();
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs font-medium text-muted-foreground">
      {{ t("Graph 节点执行") }}
    </p>

    <div
      v-for="node in nodes"
      :key="node.nodeId"
      class="relative flex gap-2 pl-4"
    >
      <div class="absolute top-0 bottom-0 left-1.5 w-px bg-border" />
      <div
        class="absolute top-1 left-0 z-10 size-3 rounded-full border bg-background"
      />

      <div class="flex flex-1 flex-col gap-1 pb-2">
        <div class="flex items-center gap-1">
          <Badge variant="outline" class="h-4 px-1 text-[10px]">
            {{ node.nodeId }}
          </Badge>
          <Badge variant="outline" class="h-4 px-1 text-[10px]">
            {{ node.nodeType }}
          </Badge>
          <AgentNodeStatusBadge :status="node.status" />
          <Badge
            v-if="node.toolCalls && node.toolCalls.length > 0"
            variant="secondary"
            class="h-4 gap-0.5 px-1 text-[10px]"
          >
            <Wrench class="size-2.5" />
            {{ node.toolCalls.length }}
          </Badge>
        </div>

        <p class="text-[10px] text-muted-foreground">
          {{ formatTime(node.startedAt) }} → {{ formatTime(node.completedAt) }}
        </p>

        <div v-if="node.streamingText" class="text-xs text-muted-foreground">
          {{ node.streamingText }}
        </div>

        <div v-if="node.error" class="text-xs text-destructive">
          {{ node.error }}
        </div>

        <div
          v-if="node.toolCalls && node.toolCalls.length > 0"
          class="flex flex-col gap-1"
        >
          <AgentToolCallCard
            v-for="tc in node.toolCalls"
            :key="tc.id"
            :toolCall="tc"
          />
        </div>
      </div>
    </div>
  </div>
</template>
