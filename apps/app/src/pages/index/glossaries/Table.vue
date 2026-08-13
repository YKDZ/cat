<script setup lang="ts">
import {
  DataTable,
  type DataTableColumn,
  type DataTableColumnVisibility,
  type DataTablePagination,
  type DataTableSort,
  Input,
} from "@cat/ui";
import { Search } from "@lucide/vue";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  toSearchRequestArgument,
  useDataTableSearch,
} from "#/utils/data-table-search.ts";
import { createDataTableLabels } from "#/utils/data-table.ts";
import { formatDate } from "#/utils/format.ts";
import { clientLogger } from "#/utils/logger.ts";
import { useRequestOwnership } from "#/utils/vue.ts";

import {
  onRequestGlossaries,
  type GlossaryListItem,
} from "./Table.telefunc.ts";

type GlossarySortColumnId = "createdAt" | "name" | "updatedAt";
type GlossaryColumnId = "description" | GlossarySortColumnId;

const { t } = useI18n();
const ctx = usePageContext();
const requestOwnership = useRequestOwnership();

const glossaries = ref<GlossaryListItem[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);
const sorting = ref<readonly DataTableSort<GlossarySortColumnId>[]>([]);
const columnVisibility = ref<DataTableColumnVisibility>({});
const { filters, search, searchInput, updateSearch } =
  useDataTableSearch(pageIndex);

const columns: readonly DataTableColumn<GlossaryListItem, GlossaryColumnId>[] =
  [
    {
      id: "name",
      header: t("名称"),
      render: (glossary) => glossary.name,
      sortable: true,
    },
    {
      id: "description",
      header: t("描述"),
      render: (glossary) => glossary.description || t("—"),
    },
    {
      id: "createdAt",
      header: t("创建时间"),
      render: (glossary) => formatDate(glossary.createdAt),
      sortable: true,
    },
    {
      id: "updatedAt",
      header: t("更新时间"),
      render: (glossary) => formatDate(glossary.updatedAt),
      sortable: true,
    },
  ];

const labels = createDataTableLabels(t);

const fetchGlossaries = async () => {
  if (!ctx.user) return;

  isLoading.value = true;
  const sort = sorting.value[0];
  const result = await requestOwnership.run(() => {
    const searchArgument = toSearchRequestArgument(search.value);
    if (sort !== undefined && searchArgument.length === 0) {
      return onRequestGlossaries(pageIndex.value, pageSize.value, null, sort);
    }
    return onRequestGlossaries(
      pageIndex.value,
      pageSize.value,
      ...searchArgument,
      ...(sort === undefined ? [] : [sort]),
    );
  });
  if (result.status === "released") return;
  if (result.status === "failure") {
    clientLogger
      .child({ component: "glossary-table" })
      .error("Failed to fetch glossaries", { error: result.error });
  } else {
    glossaries.value = result.value.data;
    total.value = result.value.total;
  }
  isLoading.value = false;
};

requestOwnership.onResume(() => void fetchGlossaries());

onMounted(() => {
  fetchGlossaries();
});

watch([pageIndex, pageSize, search, sorting], () => {
  fetchGlossaries();
});

const updatePagination = (pagination: DataTablePagination) => {
  pageIndex.value = pagination.pageIndex;
  pageSize.value = pagination.pageSize;
};

const isSupportedSort = (
  sort: DataTableSort<GlossaryColumnId>,
): sort is DataTableSort<GlossarySortColumnId> => sort.id !== "description";

const updateSorting = (next: readonly DataTableSort<GlossaryColumnId>[]) => {
  sorting.value = next.filter(isSupportedSort);
  pageIndex.value = 0;
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
    @update:pagination="updatePagination"
    @update:sorting="updateSorting"
  >
    <template #toolbar>
      <div class="relative w-full sm:w-80">
        <Input
          class="pl-8"
          :aria-label="t('搜索名称或描述')"
          :model-value="searchInput"
          :placeholder="t('搜索名称或描述...')"
          type="search"
          @update:model-value="updateSearch"
        />
        <Search
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground"
        />
      </div>
    </template>
  </DataTable>
</template>
