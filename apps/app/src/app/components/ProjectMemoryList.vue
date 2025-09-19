<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/prisma/memory";
import ProjectMemoryListItem from "./ProjectMemoryListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

defineProps<{
  memories: Memory[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectMemoryListItem
        v-for="memory in memories"
        :key="memory.id"
        :memory
      />
    </TableBody>
  </Table>
</template>
