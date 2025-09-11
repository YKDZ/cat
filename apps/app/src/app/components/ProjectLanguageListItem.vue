<script setup lang="ts">
import type { Language } from "@cat/shared/schema/prisma/misc";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { projectKey } from "../utils/provide";
import ProjectTranslationProgress from "./ProjectTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";

const props = defineProps<{
  language: Language;
}>();

const project = inject(projectKey);

const handleCheck = async () => {
  if (!project || !project.value) return;

  await navigate(`/project/${project.value.id}/${props.language.id}`);
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
