<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";

import { useKanbanStore } from "@/app/stores/kanban";

const props = defineProps<{
  /** @zh 项目外部 UUID @en Project external UUID */
  projectId: string;
}>();

const { t } = useI18n();
const kanbanStore = useKanbanStore();
const { cards, boards, isLoading } = storeToRefs(kanbanStore);

onMounted(async () => {
  await kanbanStore.fetchBoards({
    linkedResourceId: props.projectId,
    linkedResourceType: "project",
  });
  if (boards.value.length > 0) {
    await kanbanStore.fetchCards(boards.value[0].id);
  }
});

const inProgressCards = computed(() =>
  cards.value.filter((c) => ["CLAIMED", "IN_PROGRESS"].includes(c.status)),
);

const doneCount = computed(
  () => cards.value.filter((c) => c.status === "DONE").length,
);

const pendingCount = computed(
  () =>
    cards.value.filter((c) =>
      ["OPEN", "CLAIMED", "IN_PROGRESS", "REVIEW", "NEEDS_REWORK"].includes(
        c.status,
      ),
    ).length,
);

const kanbanPageUrl = (cardId?: string) => {
  const base = `/project/${props.projectId}/kanban`;
  return cardId ? `${base}?card=${cardId}` : base;
};
</script>

<template>
  <div class="min-h-0 flex-1">
    <div v-if="isLoading" class="flex items-center justify-center py-6">
      <span class="text-xs text-muted-foreground">{{ t("加载中…") }}</span>
    </div>

    <div
      v-else-if="cards.length === 0"
      class="py-4 text-center text-xs text-muted-foreground"
    >
      {{ t("暂无看板卡片") }}
      <a
        :href="kanbanPageUrl()"
        class="ml-1 text-primary underline-offset-4 hover:underline"
      >
        {{ t("前往看板") }}
      </a>
    </div>

    <div v-else class="space-y-2 p-2">
      <!-- Summary stats -->
      <div class="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{{ t("进行中: {n}", { n: inProgressCards.length }) }}</span>
        <span>{{ t("待处理: {n}", { n: pendingCount }) }}</span>
        <span>{{ t("已完成: {n}", { n: doneCount }) }}</span>
        <a
          :href="kanbanPageUrl()"
          class="ml-auto text-primary underline-offset-4 hover:underline"
        >
          {{ t("查看全部") }}
        </a>
      </div>

      <!-- In-progress card list -->
      <div
        v-for="card in inProgressCards.slice(0, 5)"
        :key="card.externalId"
        class="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
      >
        <span class="line-clamp-1 flex-1 text-xs">{{ card.title }}</span>
        <a
          :href="kanbanPageUrl(card.externalId)"
          class="ml-2 shrink-0 text-xs text-primary underline-offset-4 hover:underline"
        >
          {{ t("详情") }}
        </a>
      </div>

      <p
        v-if="inProgressCards.length > 5"
        class="text-center text-xs text-muted-foreground"
      >
        {{ t("… 以及另外 {n} 张", { n: inProgressCards.length - 5 }) }}
      </p>
    </div>
  </div>
</template>
