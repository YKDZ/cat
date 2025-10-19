<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import { navigate } from "vike/client/router";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";

const props = defineProps<{ glossary: Glossary }>();

const handleCheck = async () => {
  await navigate(`/glossary/${props.glossary.id}`);
};
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ glossary.name }}</TableCell>
    <TableCell>{{ glossary.description }}</TableCell>
    <TableCell>0</TableCell>
  </TableRow>
</template>
