<script setup lang="ts">
import { Badge } from "@cat/ui";
import { useI18n } from "vue-i18n";

import type { AgentDAGNodeEvent } from "@/app/stores/agent";

defineProps<{
  events: AgentDAGNodeEvent[];
}>();

const { t } = useI18n();

const NODE_TYPE_LABEL: Record<AgentDAGNodeEvent["nodeType"], string> = {
  precheck: "PreCheck",
  reasoning: "Reasoning",
  tool: "Tool",
  decision: "Decision",
};

const STATUS_CLASS: Record<AgentDAGNodeEvent["status"], string> = {
  started: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-destructive",
};

const formatMs = (ms?: number): string => {
  if (ms === null || ms === undefined) return "-";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs font-medium text-muted-foreground">
      {{ t("DAG 节点执行") }}
    </p>

    <div
      v-for="(event, idx) in events"
      :key="`${event.nodeId}-${idx}`"
      class="relative flex gap-2 pl-4"
    >
      <div class="absolute top-0 bottom-0 left-1.5 w-px bg-border" />
      <div
        class="absolute top-1 left-0 z-10 size-3 rounded-full border bg-background"
        :class="STATUS_CLASS[event.status]"
      />

      <div class="flex flex-1 flex-col gap-1 pb-2">
        <div class="flex flex-wrap items-center gap-1">
          <Badge variant="secondary" class="h-4 px-1 text-[10px]">
            {{ NODE_TYPE_LABEL[event.nodeType] }}
          </Badge>
          <Badge
            variant="outline"
            class="h-4 px-1 text-[10px] capitalize"
            :class="{
              'text-green-600': event.status === 'completed',
              'text-destructive': event.status === 'failed',
              'text-blue-600': event.status === 'started',
            }"
          >
            {{ event.status }}
          </Badge>
          <Badge
            v-if="event.durationMs != null"
            variant="outline"
            class="h-4 px-1 text-[10px] text-muted-foreground"
          >
            {{ formatMs(event.durationMs) }}
          </Badge>
        </div>

        <div v-if="event.tokenUsage" class="text-[10px] text-muted-foreground">
          {{ t("Tokens") }}: {{ t("prompt") }} {{ event.tokenUsage.prompt }} /
          {{ t("completion") }} {{ event.tokenUsage.completion }}
        </div>
      </div>
    </div>

    <p
      v-if="events.length === 0"
      class="text-[11px] text-muted-foreground italic"
    >
      {{ t("暂无节点执行记录") }}
    </p>
  </div>
</template>
