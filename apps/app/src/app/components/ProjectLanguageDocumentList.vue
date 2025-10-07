<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Project } from "@cat/shared/schema/drizzle/project";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import Table from "./table/Table.vue";
import TableBody from "./table/TableBody.vue";
import ProjectLanguageDocumentListItem from "./ProjectLanguageDocumentListItem.vue";

defineProps<{
  documents: Document[];
  project: Project;
  language: Language;
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectLanguageDocumentListItem
        v-for="document in documents"
        :key="document.id"
        :document
        :project
        :language
      />
    </TableBody>
  </Table>
</template>
