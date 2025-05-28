<script setup lang="ts">
import { Glossary } from "@cat/shared";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import GlossaryListItem from "@/app/components/GlossaryListItem.vue";

const glossaries = defineModel<Glossary[]>({ required: true });
</script>

<template>
  <Table>
    <TableBody>
      <GlossaryListItem
        v-for="glossary in glossaries"
        :key="glossary.id"
        :glossary
      />
    </TableBody>
  </Table>
</template>
