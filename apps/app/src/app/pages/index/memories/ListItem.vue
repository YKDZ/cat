<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import { navigate } from "vike/client/router";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";

const props = defineProps<{
  memory: Pick<Memory, "id" | "name" | "description">;
}>();

const handleCheck = async () => {
  await navigate(`/memory/${props.memory.id}`);
};
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell>{{ memory.name }}</TableCell>
    <TableCell>{{ memory.description }}</TableCell>
    <TableCell>0</TableCell>
  </TableRow>
</template>
