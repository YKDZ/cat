<script setup lang="ts">
import type { Language } from "@cat/shared/schema/prisma/misc";
import { navigate } from "vike/client/router";
import type { Project } from "@cat/shared/schema/prisma/project";
import ProjectTranslationProgress from "./ProjectTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";

const props = defineProps<{
  language: Language;
  project: Project;
}>();

const handleCheck = async () => {
  await navigate(`/project/${props.project.id}/${props.language.id}`);
};
</script>

<template>
  <TableRow
    v-if="project"
    :key="language.id"
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ language.name }}</TableCell>
    <TableCell>
      <ProjectTranslationProgress
        :language-id="language.id"
        :project-id="project.id"
      />
    </TableCell>
  </TableRow>
</template>
