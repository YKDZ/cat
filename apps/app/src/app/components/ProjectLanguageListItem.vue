<script setup lang="ts">
import type { Language } from "@cat/shared";
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
</script>

<template>
  <TableRow
    v-if="project"
    :key="language.id"
    class="cursor-pointer hover:bg-highlight-darker"
    @click="navigate(`/project/${project.id}/${language.id}`)"
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
