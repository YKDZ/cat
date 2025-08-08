<script setup lang="ts">
import type { Task } from "@cat/shared";
import { computed } from "vue";
import type { ColumnDef, Row } from "@tanstack/vue-table";
import {
  useVueTable,
  getCoreRowModel,
  FlexRender,
  getSortedRowModel,
} from "@tanstack/vue-table";

const data = defineModel<Task[]>("data", { default: [] });

const columns = computed<ColumnDef<Task>[]>(() => [
  { id: "status", accessorKey: "status", header: "状态" },
  { id: "id", accessorKey: "id", header: "ID" },
  { id: "type", accessorKey: "type", header: "类型" },
  { id: "createdAt", accessorKey: "createdAt", header: "创建时间" },
  { id: "action", accessorKey: "meta", header: "操作" },
]);

const table = useVueTable({
  data,
  columns: columns.value,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  enableSorting: true,
  initialState: {
    sorting: [
      {
        id: "createdAt",
        desc: true,
      },
    ],
  },
});

const getCellExceptAction = (row: Row<Task>) => {
  return row.getVisibleCells().filter((cell) => cell.column.id !== "action");
};

const getActionCell = (row: Row<Task>) => {
  return row.getVisibleCells().filter((cell) => cell.column.id === "action")[0];
};
</script>

<template>
  <table>
    <thead>
      <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
        <th v-for="header in headerGroup.headers" :key="header.id">
          <FlexRender
            :render="header.column.columnDef.header"
            :props="header.getContext()"
          />
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in table.getRowModel().rows" :key="row.id">
        <td v-for="cell in getCellExceptAction(row)" :key="cell.id">
          <FlexRender
            :render="cell.column.columnDef.cell"
            :props="cell.getContext()"
          />
        </td>
        <td>
          <slot :cell="getActionCell(row)" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
