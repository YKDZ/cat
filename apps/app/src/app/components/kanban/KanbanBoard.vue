<script setup lang="ts">
import type { KanbanCard } from "@cat/shared/schema/drizzle/kanban";

import { ScrollArea } from "@cat/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useKanbanStore } from "@/app/stores/kanban";

import KanbanCardComponent from "./KanbanCard.vue";
import KanbanColumnHeader from "./KanbanColumnHeader.vue";
import KanbanCreateCardDialog from "./KanbanCreateCardDialog.vue";

const props = defineProps<{
  /** @zh 所有卡片列表 @en All cards */
  cards: KanbanCard[];
  /** @zh 高亮指定卡片（可选）@en Highlighted card ID (optional) */
  highlightedCardId?: string;
  /** @zh 看板 ID（提供时启用创建卡片和拖拽移动）@en Board ID (enables card creation and drag-and-drop when provided) */
  boardId?: number;
}>();

const emit = defineEmits<{
  cardClick: [card: KanbanCard];
  cardCreated: [];
}>();

const { t } = useI18n();
const kanbanStore = useKanbanStore();

type Column = {
  id: string;
  label: string;
  statuses: KanbanCard["status"][];
  /** Status assigned when a card is dropped into this column */
  dropStatus: KanbanCard["status"];
};

const columns: Column[] = [
  { id: "open", label: t("待处理"), statuses: ["OPEN"], dropStatus: "OPEN" },
  {
    id: "active",
    label: t("进行中"),
    statuses: ["CLAIMED", "IN_PROGRESS"],
    dropStatus: "CLAIMED",
  },
  {
    id: "review",
    label: t("评审中"),
    statuses: ["REVIEW", "NEEDS_REWORK"],
    dropStatus: "REVIEW",
  },
  {
    id: "done",
    label: t("已完成"),
    statuses: ["DONE", "FAILED"],
    dropStatus: "DONE",
  },
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

// ── Drag-and-drop ────────────────────────────────────────────────────────────

const draggedCard = ref<KanbanCard | null>(null);
const dragOverColumnId = ref<string | null>(null);

const onCardDragStart = (card: KanbanCard) => {
  draggedCard.value = card;
};

const onColumnDragOver = (colId: string, event: DragEvent) => {
  event.preventDefault();
  dragOverColumnId.value = colId;
};

const onColumnDragLeave = () => {
  dragOverColumnId.value = null;
};

const onColumnDrop = async (col: Column, event: DragEvent) => {
  event.preventDefault();
  dragOverColumnId.value = null;
  const card = draggedCard.value;
  draggedCard.value = null;
  if (!card || col.statuses.includes(card.status)) return;
  await kanbanStore.updateCardStatus(card.id, col.dropStatus);
};
</script>

<template>
  <div class="flex h-full min-h-0 gap-3">
    <div
      v-for="col in columns"
      :key="col.id"
      class="flex min-w-0 flex-1 flex-col rounded-lg border bg-muted/30 transition-colors"
      :class="
        dragOverColumnId === col.id ? 'bg-primary/5 ring-2 ring-primary' : ''
      "
      @dragover="onColumnDragOver(col.id, $event)"
      @dragleave="onColumnDragLeave"
      @drop="onColumnDrop(col, $event)"
    >
      <div class="flex items-center justify-between pr-2">
        <KanbanColumnHeader
          :title="col.label"
          :count="cardsByColumn.get(col.id)?.length ?? 0"
        />
        <KanbanCreateCardDialog
          v-if="boardId"
          :boardId
          :initialStatus="col.dropStatus"
          @created="emit('cardCreated')"
        />
      </div>

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
            @dragstart="onCardDragStart(card)"
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
