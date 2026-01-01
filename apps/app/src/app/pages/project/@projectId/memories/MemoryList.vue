<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import MemoryListItem from "./MemoryListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import type { Project } from "@cat/shared/schema/drizzle/project";

defineProps<{
  memories: Memory[];
  project: Project;
}>();
</script>

<template>
  <Table>
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
