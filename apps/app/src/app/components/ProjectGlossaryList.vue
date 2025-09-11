<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import ProjectGlossaryListItem from "@/app/components/ProjectGlossaryListItem.vue";

const glossaries = defineModel<Glossary[]>({ required: true });

const handleUnlink = (id: string) => {
  glossaries.value.splice(
    glossaries.value.findIndex((glossary) => glossary.id === id),
    1,
  );
};
</script>

<template>
  <Table>
    <TableBody>
      <ProjectGlossaryListItem
        v-for="glossary in glossaries"
        :key="glossary.id"
        :glossary
        @unlink="handleUnlink(glossary.id)"
      />
    </TableBody>
  </Table>
</template>
