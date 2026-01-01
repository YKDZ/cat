<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import ListItem from "./ListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

const props = defineProps<{
  memories: Pick<Memory, "id" | "name" | "description">[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ListItem v-for="memory in memories" :key="memory.id" :memory />
    </TableBody>
  </Table>
</template>
