<script setup lang="ts">
import { Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { inject, onMounted } from "vue";
import { useI18n } from "vue-i18n";

import KanbanBoard from "@/app/components/kanban/KanbanBoard.vue";
import { useKanbanStore } from "@/app/stores/kanban";
import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";

const { t } = useI18n();
const project = inject(useInjectionKey<LayoutData>()("project"))!;

const kanbanStore = useKanbanStore();
const { cards, boards, isLoading } = storeToRefs(kanbanStore);

// Read optional ?card=<id> query param to highlight a card
const query =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
const highlightedCardId = query.get("card") ?? undefined;

onMounted(async () => {
  await kanbanStore.fetchBoards({
    linkedResourceType: "project",
    linkedResourceId: project.id,
  });
  if (boards.value.length > 0) {
    await kanbanStore.fetchCards(boards.value[0].id);
  }
});

const handleCreateBoard = async () => {
  const board = await kanbanStore.createBoard({
    name: t("默认看板"),
    linkedResourceType: "project",
    linkedResourceId: project.id,
  });
  if (board) {
    await kanbanStore.fetchCards(board.id);
  }
};
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="shrink-0 pb-4">
      <h1 class="text-lg font-semibold">{{ t("看板") }}</h1>
      <p class="text-sm text-muted-foreground">
        {{ t("查看和管理翻译任务的进度。") }}
      </p>
    </div>

    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <span class="text-sm text-muted-foreground">{{ t("加载中…") }}</span>
    </div>

    <div
      v-else-if="cards.length === 0 && boards.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground"
    >
      <p class="text-sm">{{ t("暂无看板，请先创建一个看板。") }}</p>
      <Button @click="handleCreateBoard">{{ t("创建看板") }}</Button>
    </div>

    <KanbanBoard
      v-else
      :cards
      :highlightedCardId
      :boardId="boards[0]?.id"
      class="flex-1"
      @cardCreated="() => boards[0] && kanbanStore.fetchCards(boards[0].id)"
    />
  </div>
</template>
