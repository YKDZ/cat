<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/prisma/memory";
import ProjectMemoryListItem from "./ProjectMemoryListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

const memories = defineModel<Memory[]>({ required: true });

const handleUnlink = (id: string) => {
  memories.value.splice(
    memories.value.findIndex((memory) => memory.id === id),
    1,
  );
};
</script>

<template>
  <Table>
    <TableBody>
      <ProjectMemoryListItem
        v-for="memory in memories"
        :key="memory.id"
        :memory
        @unlink="handleUnlink(memory.id)"
      />
    </TableBody>
  </Table>
</template>
