<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import ListItem from "./ListItem.vue";

defineProps<{ glossaries: Glossary[] }>();
</script>

<template>
  <Table>
    <TableBody>
      <ListItem v-for="glossary in glossaries" :key="glossary.id" :glossary />
    </TableBody>
  </Table>
</template>
