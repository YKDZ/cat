<script setup lang="ts">
import type { Language } from "@cat/shared/schema/drizzle/misc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import ProjectLanguageTableRow from "./ProjectLanguageTableRow.vue";
import { Table, TableBody } from "@/app/components/ui/table";

defineProps<{
  project: Pick<Project, "id">;
  languages: Language[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectLanguageTableRow
        v-for="language in languages"
        :key="language.id"
        :language="language"
        :project
      />
    </TableBody>
  </Table>
</template>
