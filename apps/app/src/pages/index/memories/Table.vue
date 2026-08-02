<script setup lang="ts">
import {
  DataTable,
  type DataTableColumn,
  type DataTableColumnVisibility,
  type DataTableFilters,
  type DataTablePagination,
  type DataTableSort,
} from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { createDataTableLabels } from "#/utils/data-table.ts";
import { formatDate } from "#/utils/format.ts";
import { clientLogger } from "#/utils/logger.ts";

import { onRequestMemories, type MemoryListItem } from "./Table.telefunc.ts";

const { t } = useI18n();
const ctx = usePageContext();

const memories = ref<MemoryListItem[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);
const sorting = ref<readonly DataTableSort[]>([]);
const filters = ref<DataTableFilters>({});
const columnVisibility = ref<DataTableColumnVisibility>({});

const columns: readonly DataTableColumn<MemoryListItem>[] = [
  { id: "name", header: t("名称"), render: (memory) => memory.name },
  {
    id: "description",
    header: t("描述"),
    render: (memory) => memory.description || t("—"),
  },
  {
    id: "createdAt",
    header: t("创建时间"),
    render: (memory) => formatDate(memory.createdAt),
  },
  {
    id: "updatedAt",
    header: t("更新时间"),
    render: (memory) => formatDate(memory.updatedAt),
  },
];

const labels = createDataTableLabels(t);

const fetchMemories = async () => {
  if (!ctx.user) return;

  isLoading.value = true;
  try {
    const result = await onRequestMemories(pageIndex.value, pageSize.value);
    memories.value = result.data;
    total.value = result.total;
  } catch (err) {
    clientLogger
      .child({ component: "memory-table" })
      .error("Failed to fetch memories", { error: err });
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchMemories();
});

watch([pageIndex, pageSize], () => {
  fetchMemories();
});

const updatePagination = (pagination: DataTablePagination) => {
  pageIndex.value = pagination.pageIndex;
  pageSize.value = pagination.pageSize;
};
</script>

<template>
  <DataTable
    :column-visibility="columnVisibility"
    :columns="columns"
    :filters="filters"
    :labels="labels"
    :loading="isLoading"
    :pagination="{ pageIndex, pageSize }"
    :row-count="total"
    :row-action-label="
      (memory) => t('打开记忆库：{name}', { name: memory.name })
    "
    :rows="memories"
    :sorting="sorting"
    :row-key="(memory) => memory.id"
    @row-click="navigate(`/memory/${$event.id}`)"
    @update:column-visibility="columnVisibility = $event"
    @update:filters="filters = $event"
    @update:pagination="updatePagination"
    @update:sorting="sorting = $event"
  />
</template>
