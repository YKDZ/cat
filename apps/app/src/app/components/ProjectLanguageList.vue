<script setup lang="ts">
import type { Language } from "@cat/shared/schema/prisma/misc";
import type { Project } from "@cat/shared/schema/prisma/project";
import ProjectLanguageListItem from "./ProjectLanguageListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

defineProps<{
  project: Project;
  languages: Language[];
}>();
</script>

<template>
  <Table>
    <TableBody v-if="project">
      <ProjectLanguageListItem
        v-for="language in languages"
        :key="language.id"
        :language="language"
        :project
      />
    </TableBody>
  </Table>
</template>
