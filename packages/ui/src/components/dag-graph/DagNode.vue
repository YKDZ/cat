<script setup lang="ts">
/**
 * @shadcn-custom-component
 * description: Custom DAG node for Vue Flow, renders workflow node with status styling
 * lastReviewed: 2026-03-20
 */
import { Handle, Position, type NodeProps } from "@vue-flow/core";
import {
  ArrowRightLeft,
  Brain,
  GitBranch,
  GitFork,
  GitMerge,
  Layers,
  Repeat,
  UserRound,
  Wrench,
} from "lucide-vue-next";
import { computed } from "vue";

import { Badge } from "@/components/badge";

import type { DagNodeData, DagNodeStatus, DagNodeType } from "./types";

type DagNodeProps = NodeProps<DagNodeData>;

const props = defineProps<DagNodeProps>();

const iconMap: Record<DagNodeType, typeof Brain> = {
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

const statusClassMap: Record<DagNodeStatus, string> = {
  pending: "border-muted-foreground/30 bg-muted/20",
  running: "border-blue-500 bg-blue-50 animate-pulse",
  completed: "border-green-500 bg-green-50",
  error: "border-destructive bg-destructive/10",
  paused: "border-yellow-500 bg-yellow-50",
};

const badgeVariantMap: Record<
  DagNodeStatus,
  "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  running: "outline",
  completed: "secondary",
  error: "destructive",
  paused: "outline",
};

const statusLabelMap: Record<DagNodeStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Done",
  error: "Error",
  paused: "Paused",
};

const icon = computed(() => iconMap[props.data.type]);
const status = computed(() => props.data.status);
const containerClass = computed(() => {
  const base =
    "relative flex flex-col justify-center px-3 py-2 rounded-lg border-2 min-w-[160px] min-h-[56px] shadow-sm cursor-pointer";
  const statusCls = status.value
    ? statusClassMap[status.value]
    : "border-muted-foreground/30 bg-muted/20";
  return `${base} ${statusCls}`;
});
</script>

<template>
  <Handle id="top" type="target" :position="Position.Top" />
  <Handle id="left" type="target" :position="Position.Left" />

  <div :class="containerClass">
    <!-- Entry marker -->
    <span
      v-if="props.data.isEntry"
      class="absolute -top-2 -left-2 size-4 rounded-full border-2 border-background bg-primary"
    />
    <!-- Exit marker -->
    <span
      v-if="props.data.isExit"
      class="absolute -right-2 -bottom-2 size-4 rounded-full border-2 border-background bg-green-500"
    />

    <div class="flex items-center gap-2">
      <component :is="icon" class="size-4 shrink-0 text-muted-foreground" />
      <span class="truncate text-sm font-medium">{{ props.data.label }}</span>
    </div>

    <div v-if="status" class="mt-1 flex justify-end">
      <Badge :variant="badgeVariantMap[status]" class="h-4 px-1 text-[9px]">
        {{ statusLabelMap[status] }}
      </Badge>
    </div>
  </div>

  <Handle id="bottom" type="source" :position="Position.Bottom" />
  <Handle id="right" type="source" :position="Position.Right" />
</template>
