<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import ProjectGlossaryListItem from "@/app/components/ProjectGlossaryListItem.vue";
import type { Project } from "@cat/shared/schema/prisma/project";

defineProps<{
  glossaries: Glossary[];
  project: Project;
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectGlossaryListItem
        v-for="glossary in glossaries"
        :key="glossary.id"
        :glossary
        :project
      />
    </TableBody>
  </Table>
</template>
