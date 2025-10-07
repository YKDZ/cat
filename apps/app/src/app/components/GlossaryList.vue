<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import GlossaryListItem from "@/app/components/GlossaryListItem.vue";

defineProps<{ glossaries: Glossary[] }>();
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
