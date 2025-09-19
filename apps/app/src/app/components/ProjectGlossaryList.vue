<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import ProjectGlossaryListItem from "@/app/components/ProjectGlossaryListItem.vue";

defineProps<{
  glossaries: Glossary[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectGlossaryListItem
        v-for="glossary in glossaries"
        :key="glossary.id"
        :glossary
      />
    </TableBody>
  </Table>
</template>
