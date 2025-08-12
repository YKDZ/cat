<script setup lang="ts">
import type { Task } from "@cat/shared";
import { computed } from "vue";
import type { ColumnDef } from "@tanstack/vue-table";
import {
  useVueTable,
  getCoreRowModel,
  FlexRender,
  getSortedRowModel,
} from "@tanstack/vue-table";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const TASK_TYPE_TRANSLATION = new Map<string, string>([
  ["export_translated_file", t("导出翻译后文件")],
  ["document_file_pretreatment", t("文档文件预处理")],
  ["import_plugin", t("导入插件")],
  ["auto_translate", t("自动翻译")],
  ["update_translation", t("更新翻译")],
  ["create_translation", t("创建翻译")],
  ["clean_dangling_files", t("清理悬空文件")],
]);

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
        <td v-for="cell in row.getVisibleCells()" :key="cell.id">
          <FlexRender
            v-if="cell.column.id !== 'action' && cell.column.id !== 'type'"
            :render="cell.column.columnDef.cell"
            :props="cell.getContext()"
          />
          <span v-if="cell.column.id === 'type'">{{
            TASK_TYPE_TRANSLATION.get(cell.getValue() as string)
          }}</span>
          <slot v-if="cell.column.id === 'action'" :cell />
        </td>
      </tr>
    </tbody>
  </table>
</template>
