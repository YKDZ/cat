<script
  setup
  lang="ts"
  generic="
    TRow extends object,
    TColumnId extends string = string,
    TFilterId extends string = string
  "
>
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
} from "@lucide/vue";
import { computed, ref } from "vue";

import Button from "#/components/button/Button.vue";
import DropdownMenu from "#/components/dropdown-menu/DropdownMenu.vue";
import DropdownMenuCheckboxItem from "#/components/dropdown-menu/DropdownMenuCheckboxItem.vue";
import DropdownMenuContent from "#/components/dropdown-menu/DropdownMenuContent.vue";
import DropdownMenuTrigger from "#/components/dropdown-menu/DropdownMenuTrigger.vue";
import Skeleton from "#/components/skeleton/Skeleton.vue";
import Table from "#/components/table/Table.vue";
import TableBody from "#/components/table/TableBody.vue";
import TableCell from "#/components/table/TableCell.vue";
import TableHead from "#/components/table/TableHead.vue";
import TableHeader from "#/components/table/TableHeader.vue";
import TableRow from "#/components/table/TableRow.vue";

import type {
  DataTableColumn,
  DataTableColumnVisibility,
  DataTableFilters,
  DataTableLabels,
  DataTablePagination,
  DataTableSort,
} from "./types.ts";

const props = withDefaults(
  defineProps<{
    columnVisibility: DataTableColumnVisibility<TColumnId>;
    columns: readonly DataTableColumn<TRow, TColumnId>[];
    filters: DataTableFilters<TFilterId>;
    hasNext?: boolean;
    hasPrevious?: boolean;
    labels: DataTableLabels;
    loading?: boolean;
    paginationMode?: "cursor" | "offset";
    pageSizeOptions?: readonly number[];
    pagination: DataTablePagination;
    rowCount: number;
    rowActionLabel?: (row: TRow) => string;
    rowKey: (row: TRow) => string;
    rows: readonly TRow[];
    selection?: readonly string[];
    sorting: readonly DataTableSort<TColumnId>[];
  }>(),
  {
    loading: false,
    paginationMode: "offset",
    pageSizeOptions: () => [10, 20, 50],
  },
);

const emit = defineEmits<{
  "row-click": [row: TRow];
  "update:columnVisibility": [visibility: DataTableColumnVisibility<TColumnId>];
  "update:filters": [filters: DataTableFilters<TFilterId>];
  "update:pagination": [pagination: DataTablePagination];
  "update:selection": [selection: readonly string[]];
  "update:sorting": [sorting: readonly DataTableSort<TColumnId>[]];
}>();

const showColumns = ref(false);
const selectionEnabled = computed(() => props.selection !== undefined);
const visibleColumns = computed(() => {
  const configured = props.columns.filter(
    (column) => props.columnVisibility[column.id] !== false,
  );
  return configured.length > 0 ? configured : props.columns.slice(0, 1);
});
const isColumnVisible = (columnId: TColumnId) =>
  visibleColumns.value.some((column) => column.id === columnId);
const canHideColumn = (columnId: TColumnId) =>
  !isColumnVisible(columnId) || visibleColumns.value.length > 1;
const selectedRows = computed(() => {
  if (!selectionEnabled.value) return [];
  const selected = new Set(props.selection);
  return props.rows.filter((row) => selected.has(props.rowKey(row)));
});
const visibleRowKeys = computed(() =>
  props.rows.map((row) => props.rowKey(row)),
);
const allVisibleRowsSelected = computed(
  () =>
    visibleRowKeys.value.length > 0 &&
    visibleRowKeys.value.every((key) => props.selection?.includes(key)),
);
const someVisibleRowsSelected = computed(
  () =>
    !allVisibleRowsSelected.value &&
    visibleRowKeys.value.some((key) => props.selection?.includes(key)),
);
const range = computed(() => {
  if (props.rowCount === 0) return { from: 0, to: 0, total: 0 };
  const from = props.pagination.pageIndex * props.pagination.pageSize + 1;
  return {
    from,
    to: Math.min(from + props.rows.length - 1, props.rowCount),
    total: props.rowCount,
  };
});
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.rowCount / props.pagination.pageSize)),
);
const isFirstPage = computed(() => props.pagination.pageIndex === 0);
const isLastPage = computed(
  () => props.pagination.pageIndex >= pageCount.value - 1,
);
const canGoPrevious = computed(() =>
  props.paginationMode === "cursor"
    ? (props.hasPrevious ?? false)
    : !isFirstPage.value,
);
const canGoNext = computed(() =>
  props.paginationMode === "cursor"
    ? (props.hasNext ?? false)
    : !isLastPage.value,
);

const changePage = (pageIndex: number) => {
  const bounded =
    props.paginationMode === "cursor"
      ? Math.max(0, pageIndex)
      : Math.max(0, Math.min(pageIndex, pageCount.value - 1));
  if (bounded === props.pagination.pageIndex) return;
  emit("update:pagination", { ...props.pagination, pageIndex: bounded });
};

const changePageSize = (event: Event) => {
  const pageSize = Number((event.target as HTMLSelectElement).value);
  if (!Number.isInteger(pageSize) || pageSize < 1) return;
  emit("update:pagination", { pageIndex: 0, pageSize });
};

const toggleSort = (column: DataTableColumn<TRow, TColumnId>) => {
  if (!column.sortable) return;
  const current = props.sorting.find((sort) => sort.id === column.id);
  const next =
    current === undefined
      ? [{ id: column.id, desc: false }]
      : current.desc
        ? []
        : [{ id: column.id, desc: true }];
  emit("update:sorting", next);
};

const toggleColumn = (columnId: TColumnId, visible: boolean) => {
  if (!visible && !canHideColumn(columnId)) return;
  const visibility: DataTableColumnVisibility<TColumnId> = {
    ...props.columnVisibility,
    [columnId]: visible,
  };
  emit("update:columnVisibility", visibility);
};

const toggleRow = (row: TRow, checked: boolean) => {
  if (props.selection === undefined) return;
  const key = props.rowKey(row);
  const selection = new Set(props.selection);
  if (checked) selection.add(key);
  else selection.delete(key);
  emit("update:selection", [...selection]);
};

const toggleVisibleRows = (checked: boolean) => {
  if (props.selection === undefined) return;
  const selection = new Set(props.selection);
  for (const key of visibleRowKeys.value) {
    if (checked) selection.add(key);
    else selection.delete(key);
  }
  emit("update:selection", [...selection]);
};

const setFilters = (filters: DataTableFilters<TFilterId>) => {
  emit("update:filters", filters);
};

const rowSort = (columnId: TColumnId): "ascending" | "descending" | "none" => {
  const sort = props.sorting.find((candidate) => candidate.id === columnId);
  return sort === undefined ? "none" : sort.desc ? "descending" : "ascending";
};

const activateRow = (row: TRow) => emit("row-click", row);

const handleRowClick = (row: TRow, event: MouseEvent) => {
  const interactive = (event.target as Element | null)?.closest(
    "a, button, input, select, textarea, [role=button]",
  );
  if (interactive === null) activateRow(row);
};
</script>

<template>
  <section data-data-table class="min-w-0 space-y-3" :aria-busy="loading">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <slot
        name="toolbar"
        :filters="filters"
        :selected-rows="selectedRows"
        :set-filters="setFilters"
      />
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <slot name="commands" :selected-rows="selectedRows" />
        <div v-if="selectionEnabled" class="text-sm text-muted-foreground">
          {{ labels.selected({ count: selection?.length ?? 0 }) }}
        </div>
        <DropdownMenu @update:open="showColumns = $event">
          <DropdownMenuTrigger as-child>
            <Button
              size="icon"
              variant="outline"
              :aria-expanded="showColumns"
              :aria-label="labels.columns"
              :title="labels.columns"
            >
              <Columns3 class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              v-for="column in columns"
              :key="column.id"
              :aria-label="column.header"
              :checked="isColumnVisible(column.id)"
              :disabled="
                isColumnVisible(column.id) && !canHideColumn(column.id)
              "
              @update:checked="toggleColumn(column.id, $event === true)"
            >
              {{ column.header }}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <slot name="bulk-actions" :selected-rows="selectedRows" />

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead v-if="selectionEnabled" class="w-10">
            <input
              type="checkbox"
              :aria-label="labels.selectAll"
              :checked="allVisibleRowsSelected"
              :indeterminate="someVisibleRowsSelected"
              @change="
                toggleVisibleRows(($event.target as HTMLInputElement).checked)
              "
            />
          </TableHead>
          <TableHead
            v-for="column in visibleColumns"
            :key="column.id"
            :aria-sort="column.sortable ? rowSort(column.id) : undefined"
          >
            <button
              v-if="column.sortable"
              class="inline-flex max-w-full items-center gap-1 text-left hover:text-foreground"
              type="button"
              :aria-label="column.header"
              @click="toggleSort(column)"
            >
              <span class="truncate">{{ column.header }}</span>
              <ArrowUpDown
                v-if="rowSort(column.id) === 'none'"
                class="size-3 shrink-0"
              />
              <ArrowUp
                v-else-if="rowSort(column.id) === 'ascending'"
                class="size-3 shrink-0"
              />
              <ArrowDown v-else class="size-3 shrink-0" />
            </button>
            <span v-else class="block truncate">{{ column.header }}</span>
          </TableHead>
          <TableHead v-if="rowActionLabel !== undefined" class="w-10">
            <span class="sr-only">{{ labels.actions }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="loading">
          <TableRow v-for="index in pagination.pageSize" :key="index">
            <TableCell v-if="selectionEnabled" class="w-10"
              ><Skeleton class="h-4 w-4"
            /></TableCell>
            <TableCell v-for="column in visibleColumns" :key="column.id">
              <Skeleton class="h-4 w-full min-w-20" />
            </TableCell>
            <TableCell v-if="rowActionLabel !== undefined" class="w-10">
              <Skeleton class="size-4" />
            </TableCell>
          </TableRow>
        </template>
        <TableRow v-else-if="rows.length === 0">
          <TableCell
            :colspan="
              visibleColumns.length +
              (selectionEnabled ? 1 : 0) +
              (rowActionLabel !== undefined ? 1 : 0)
            "
            class="py-10 text-center text-muted-foreground"
          >
            {{ labels.empty }}
          </TableCell>
        </TableRow>
        <TableRow
          v-for="row in rows"
          v-else
          :key="rowKey(row)"
          :data-row-id="rowKey(row)"
          :data-state="
            selection?.includes(rowKey(row)) ? 'selected' : undefined
          "
          @click="handleRowClick(row, $event)"
        >
          <TableCell v-if="selectionEnabled" class="w-10">
            <input
              type="checkbox"
              :aria-label="labels.selectRow(rowKey(row))"
              :checked="selection?.includes(rowKey(row))"
              @click.stop
              @change="
                toggleRow(row, ($event.target as HTMLInputElement).checked)
              "
            />
          </TableCell>
          <TableCell v-for="column in visibleColumns" :key="column.id">
            <slot :name="`cell-${column.id}`" :column="column" :row="row">
              {{ column.render?.(row) ?? "" }}
            </slot>
          </TableCell>
          <TableCell v-if="rowActionLabel !== undefined" class="w-10">
            <Button
              data-row-action
              size="icon-sm"
              variant="ghost"
              :aria-label="rowActionLabel(row)"
              :title="rowActionLabel(row)"
              @click="activateRow(row)"
            >
              <ChevronRight class="size-4" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <footer
      class="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm"
    >
      <span class="min-w-0 text-muted-foreground">
        {{ labels.range(range) }}
      </span>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <label
          class="flex items-center gap-2 whitespace-nowrap text-muted-foreground"
        >
          <span>{{ labels.pageSize }}</span>
          <select
            class="h-8 rounded-md border bg-background px-2 text-foreground"
            :aria-label="labels.pageSize"
            :value="pagination.pageSize"
            @change="changePageSize"
          >
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }}
            </option>
          </select>
        </label>
        <div class="flex shrink-0 items-center gap-1">
          <Button
            v-if="paginationMode === 'offset'"
            size="icon-sm"
            variant="outline"
            :aria-label="labels.firstPage"
            :title="labels.firstPage"
            :disabled="loading || !canGoPrevious"
            @click="changePage(0)"
            ><ChevronsLeft class="size-4"
          /></Button>
          <Button
            size="icon-sm"
            variant="outline"
            :aria-label="labels.previousPage"
            :title="labels.previousPage"
            :disabled="loading || !canGoPrevious"
            @click="changePage(pagination.pageIndex - 1)"
            ><ChevronLeft class="size-4"
          /></Button>
          <span class="min-w-12 text-center tabular-nums"
            >{{ pagination.pageIndex + 1
            }}<template v-if="paginationMode === 'offset'">
              / {{ pageCount }}</template
            ></span
          >
          <Button
            size="icon-sm"
            variant="outline"
            :aria-label="labels.nextPage"
            :title="labels.nextPage"
            :disabled="loading || !canGoNext"
            @click="changePage(pagination.pageIndex + 1)"
            ><ChevronRight class="size-4"
          /></Button>
          <Button
            v-if="paginationMode === 'offset'"
            size="icon-sm"
            variant="outline"
            :aria-label="labels.lastPage"
            :title="labels.lastPage"
            :disabled="loading || !canGoNext"
            @click="changePage(pageCount - 1)"
            ><ChevronsRight class="size-4"
          /></Button>
        </div>
      </div>
    </footer>
  </section>
</template>
