<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import { navigate } from "vike/client/router";
import TableCell from "@/app/components/ui/table/TableCell.vue";
import TableRow from "@/app/components/ui/table/TableRow.vue";
import { formatDate } from "@/app/utils/format";

const props = defineProps<{
  memory: Pick<
    Memory,
    "id" | "name" | "description" | "createdAt" | "updatedAt"
  >;
}>();

const handleCheck = async () => {
  await navigate(`/memory/${props.memory.id}`);
};
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell class="font-medium">{{ memory.name }}</TableCell>
    <TableCell class="text-gray-600">{{ memory.description || "—" }}</TableCell>
    <TableCell class="text-gray-500">{{
      formatDate(memory.createdAt)
    }}</TableCell>
    <TableCell class="text-gray-500">{{
      formatDate(memory.updatedAt)
    }}</TableCell>
  </TableRow>
</template>
