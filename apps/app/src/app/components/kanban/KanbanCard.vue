<script setup lang="ts">
import type { KanbanCard } from "@cat/shared/schema/drizzle/kanban";

import { Badge } from "@cat/ui";
import { useI18n } from "vue-i18n";

defineProps<{
  card: KanbanCard;
}>();

const emit = defineEmits<{
  click: [card: KanbanCard];
}>();

const { t } = useI18n();

const statusColorMap: Record<string, string> = {
  OPEN: "bg-muted text-muted-foreground",
  CLAIMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  REVIEW:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  DONE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  FAILED: "bg-destructive/10 text-destructive",
  NEEDS_REWORK:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const statusLabelMap: Record<string, string> = {
  OPEN: "待处理",
  CLAIMED: "已领取",
  IN_PROGRESS: "进行中",
  REVIEW: "评审中",
  DONE: "已完成",
  FAILED: "失败",
  NEEDS_REWORK: "需返工",
};

const priorityColorMap: Record<number, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  2: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  3: "bg-destructive/10 text-destructive",
};

const priorityLabelMap: Record<number, string> = {
  0: "普通",
  1: "低",
  2: "高",
  3: "紧急",
};
</script>

<template>
  <div
    class="cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
    @click="emit('click', card)"
  >
    <!-- Title -->
    <p class="mb-2 line-clamp-2 text-sm font-medium text-foreground">
      {{ card.title }}
    </p>

    <!-- Description (if any) -->
    <p
      v-if="card.description"
      class="mb-2 line-clamp-1 text-xs text-muted-foreground"
    >
      {{ card.description }}
    </p>

    <!-- Footer: status + priority badges -->
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        :class="statusColorMap[card.status] ?? 'bg-muted text-muted-foreground'"
      >
        {{ t(statusLabelMap[card.status] ?? card.status) }}
      </span>

      <span
        v-if="card.priority > 0"
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          priorityColorMap[card.priority] ?? 'bg-muted text-muted-foreground'
        "
      >
        {{ t(priorityLabelMap[card.priority] ?? String(card.priority)) }}
      </span>

      <!-- Labels -->
      <Badge
        v-for="label in card.labels.slice(0, 2)"
        :key="label"
        variant="secondary"
        class="text-xs"
      >
        {{ label }}
      </Badge>
      <span v-if="card.labels.length > 2" class="text-xs text-muted-foreground">
        {{ t("+{n} 个标签", { n: card.labels.length - 2 }) }}
      </span>
    </div>
  </div>
</template>
