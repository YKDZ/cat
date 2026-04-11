<script setup lang="ts">
import { ScrollArea } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

import ChangeSetAuditCard from "./ChangeSetAuditCard.vue";

const { t } = useI18n();

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  (e: "view", externalId: string): void;
}>();

type ChangesetStatusFilter =
  | "PENDING"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED"
  | "APPLIED"
  | "CONFLICT"
  | "";

const PAGE_SIZE = 20;

const statusFilter = ref<ChangesetStatusFilter>("");
const page = ref(0);

const offset = computed(() => page.value * PAGE_SIZE);

const { state: listState, refresh } = useQuery({
  key: () => [
    "changeset-list",
    props.projectId,
    statusFilter.value,
    page.value,
  ],
  query: () =>
    orpc.changeset.list({
      projectId: props.projectId,
      status: statusFilter.value || undefined,
      limit: PAGE_SIZE,
      offset: offset.value,
    }),
  enabled: !import.meta.env.SSR,
});

const changesets = computed(() => {
  // API returns ascending order; reverse for newest-first display
  const data = listState.value.data;
  if (!data) return [];
  return [...data].reverse();
});

const hasMore = computed(
  () => (listState.value.data?.length ?? 0) >= PAGE_SIZE,
);

const setStatus = (s: ChangesetStatusFilter) => {
  statusFilter.value = s;
  page.value = 0;
};

const prevPage = () => {
  if (page.value > 0) page.value -= 1;
};

const nextPage = () => {
  if (hasMore.value) page.value += 1;
};

const statusOptions: { label: string; value: ChangesetStatusFilter }[] = [
  { label: "全部", value: "" },
  { label: "待审核", value: "PENDING" },
  { label: "已批准", value: "APPROVED" },
  { label: "部分批准", value: "PARTIALLY_APPROVED" },
  { label: "已拒绝", value: "REJECTED" },
  { label: "已应用", value: "APPLIED" },
  { label: "冲突", value: "CONFLICT" },
];
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header + Filters -->
    <div
      class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
    >
      <h2 class="text-base font-semibold">{{ t("变更集审计日志") }}</h2>
      <div class="flex items-center gap-2">
        <!-- Status filter -->
        <select
          :value="statusFilter"
          class="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none"
          @change="
            setStatus(
              ($event.target as HTMLSelectElement)
                .value as ChangesetStatusFilter,
            )
          "
        >
          <option
            v-for="opt in statusOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ t(opt.label) }}
          </option>
        </select>

        <!-- Refresh -->
        <button
          class="rounded-md border px-2 py-1 text-sm transition-colors hover:bg-muted/50"
          @click="refresh()"
        >
          {{ t("刷新") }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="listState.status === 'pending'"
      class="flex flex-1 items-center justify-center"
    >
      <span class="text-sm text-muted-foreground">{{ t("加载中...") }}</span>
    </div>

    <!-- Error -->
    <div
      v-else-if="listState.status === 'error'"
      class="flex flex-1 items-center justify-center"
    >
      <span class="text-sm text-destructive">{{ t("加载失败") }}</span>
    </div>

    <!-- Content -->
    <template v-else>
      <ScrollArea class="min-h-0 flex-1">
        <div class="flex flex-col gap-2 p-4">
          <ChangeSetAuditCard
            v-for="cs in changesets"
            :key="cs.id"
            :changeset="cs"
            @view="emit('view', $event)"
          />
          <div
            v-if="changesets.length === 0"
            class="py-12 text-center text-sm text-muted-foreground"
          >
            {{ t("暂无变更集记录") }}
          </div>
        </div>
      </ScrollArea>

      <!-- Pagination -->
      <div
        class="flex shrink-0 items-center justify-between border-t px-4 py-3"
      >
        <button
          class="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50 disabled:opacity-40"
          :disabled="page === 0"
          @click="prevPage"
        >
          {{ t("上一页") }}
        </button>
        <span class="text-xs text-muted-foreground">{{
          t("第 {n} 页", { n: page + 1 })
        }}</span>
        <button
          class="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50 disabled:opacity-40"
          :disabled="!hasMore"
          @click="nextPage"
        >
          {{ t("下一页") }}
        </button>
      </div>
    </template>
  </div>
</template>
