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

import {
  onRequestGlossaries,
  type GlossaryListItem,
} from "./Table.telefunc.ts";

const { t } = useI18n();
const ctx = usePageContext();

const glossaries = ref<GlossaryListItem[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);
const sorting = ref<readonly DataTableSort[]>([]);
const filters = ref<DataTableFilters>({});
const columnVisibility = ref<DataTableColumnVisibility>({});

const columns: readonly DataTableColumn<GlossaryListItem>[] = [
  { id: "name", header: t("名称"), render: (glossary) => glossary.name },
  {
    id: "description",
    header: t("描述"),
    render: (glossary) => glossary.description || t("—"),
  },
  {
    id: "createdAt",
    header: t("创建时间"),
    render: (glossary) => formatDate(glossary.createdAt),
  },
  {
    id: "updatedAt",
    header: t("更新时间"),
    render: (glossary) => formatDate(glossary.updatedAt),
  },
];

const labels = createDataTableLabels(t);

const fetchGlossaries = async () => {
  if (!ctx.user) return;

  isLoading.value = true;
  try {
    const result = await onRequestGlossaries(pageIndex.value, pageSize.value);
    glossaries.value = result.data;
    total.value = result.total;
  } catch (err) {
    clientLogger
      .child({ component: "glossary-table" })
      .error("Failed to fetch glossaries", { error: err });
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchGlossaries();
});

watch([pageIndex, pageSize], () => {
  fetchGlossaries();
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
      (glossary) => t('打开术语库：{name}', { name: glossary.name })
    "
    :rows="glossaries"
    :sorting="sorting"
    :row-key="(glossary) => glossary.id"
    @row-click="navigate(`/glossary/${$event.id}`)"
    @update:column-visibility="columnVisibility = $event"
    @update:filters="filters = $event"
    @update:pagination="updatePagination"
    @update:sorting="sorting = $event"
  />
</template>
