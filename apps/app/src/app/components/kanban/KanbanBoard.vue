<script setup lang="ts">
import type { KanbanCard } from "@cat/shared/schema/drizzle/kanban";

import { ScrollArea } from "@cat/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import KanbanCardComponent from "./KanbanCard.vue";
import KanbanColumnHeader from "./KanbanColumnHeader.vue";

const props = defineProps<{
  /** @zh 所有卡片列表 @en All cards */
  cards: KanbanCard[];
  /** @zh 高亮指定卡片（可选）@en Highlighted card ID (optional) */
  highlightedCardId?: string;
}>();

const emit = defineEmits<{
  cardClick: [card: KanbanCard];
}>();

const { t } = useI18n();

type Column = {
  id: string;
  label: string;
  statuses: KanbanCard["status"][];
};

const columns: Column[] = [
  { id: "open", label: t("待处理"), statuses: ["OPEN"] },
  { id: "active", label: t("进行中"), statuses: ["CLAIMED", "IN_PROGRESS"] },
  { id: "review", label: t("评审中"), statuses: ["REVIEW", "NEEDS_REWORK"] },
  { id: "done", label: t("已完成"), statuses: ["DONE", "FAILED"] },
];

const cardsByColumn = computed(() => {
  const map = new Map<string, KanbanCard[]>();
  for (const col of columns) {
    map.set(
      col.id,
      props.cards.filter((c) => col.statuses.includes(c.status)),
    );
  }
  return map;
});
</script>

<template>
  <div class="flex h-full min-h-0 gap-3 overflow-x-auto">
    <div
      v-for="col in columns"
      :key="col.id"
      class="flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30"
    >
      <KanbanColumnHeader
        :title="col.label"
        :count="cardsByColumn.get(col.id)?.length ?? 0"
      />

      <ScrollArea class="min-h-0 flex-1">
        <div class="flex flex-col gap-2 p-2">
          <KanbanCardComponent
            v-for="card in cardsByColumn.get(col.id)"
            :key="card.externalId"
            :card
            :class="
              highlightedCardId === card.externalId ? 'ring-2 ring-primary' : ''
            "
            @click="emit('cardClick', card)"
          />

          <!-- Empty state per column -->
          <div
            v-if="(cardsByColumn.get(col.id)?.length ?? 0) === 0"
            class="flex items-center justify-center py-6 text-xs text-muted-foreground"
          >
            {{ t("暂无卡片") }}
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
