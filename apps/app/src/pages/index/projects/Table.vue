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

import { onRequestProjects, type ProjectListItem } from "./Table.telefunc.ts";

const { t } = useI18n();
const ctx = usePageContext();

const projects = ref<ProjectListItem[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);
const sorting = ref<readonly DataTableSort[]>([]);
const filters = ref<DataTableFilters>({});
const columnVisibility = ref<DataTableColumnVisibility>({});

const columns: readonly DataTableColumn<ProjectListItem>[] = [
  { id: "name", header: t("名称"), render: (project) => project.name },
  {
    id: "description",
    header: t("描述"),
    render: (project) => project.description || t("—"),
  },
  {
    id: "createdAt",
    header: t("创建时间"),
    render: (project) => formatDate(project.createdAt),
  },
  {
    id: "updatedAt",
    header: t("更新时间"),
    render: (project) => formatDate(project.updatedAt),
  },
];

const labels = createDataTableLabels(t);

const fetchProjects = async () => {
  if (!ctx.user) return;

  isLoading.value = true;
  try {
    const result = await onRequestProjects(pageIndex.value, pageSize.value);
    projects.value = result.data;
    total.value = result.total;
  } catch (err) {
    clientLogger
      .child({ component: "project-table" })
      .error("Failed to fetch projects", { error: err });
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchProjects();
});

watch([pageIndex, pageSize], () => {
  fetchProjects();
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
      (project) => t('打开项目：{name}', { name: project.name })
    "
    :rows="projects"
    :sorting="sorting"
    :row-key="(project) => project.id"
    @row-click="navigate(`/project/${$event.id}`)"
    @update:column-visibility="columnVisibility = $event"
    @update:filters="filters = $event"
    @update:pagination="updatePagination"
    @update:sorting="sorting = $event"
  />
</template>
