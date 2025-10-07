<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import MemoryListItem from "./MemoryListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

const memories = defineModel<Memory[]>({ required: true });
</script>

<template>
  <Table>
    <TableBody>
      <MemoryListItem v-for="memory in memories" :key="memory.id" :memory />
    </TableBody>
  </Table>
</template>
