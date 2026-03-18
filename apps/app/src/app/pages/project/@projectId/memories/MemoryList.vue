<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@cat/ui";
import { useI18n } from "vue-i18n";

import MemoryListItem from "./MemoryListItem.vue";

const { t } = useI18n();


defineProps<{
  memories: Memory[];
  project: Project;
}>();
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ t("名称") }}</TableHead>
        <TableHead>{{ t("描述") }}</TableHead>
        <TableHead>{{ t("创建时间") }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <MemoryListItem
        v-for="memory in memories"
        :key="memory.id"
        :memory
        :project
      />
    </TableBody>
  </Table>
</template>
