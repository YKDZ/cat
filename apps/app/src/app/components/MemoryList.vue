<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/prisma/memory";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import MemoryListItem from "./MemoryListItem.vue";

const memories = defineModel<Memory[]>({ required: true });
</script>

<template>
  <Table>
    <TableBody>
      <MemoryListItem v-for="memory in memories" :key="memory.id" :memory />
    </TableBody>
  </Table>
</template>
