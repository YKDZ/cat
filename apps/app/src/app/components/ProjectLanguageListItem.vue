<script setup lang="ts">
import type { Language } from "@cat/shared/schema/prisma/misc";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import ProjectTranslationProgress from "./ProjectTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import { projectKey } from "@/app/utils/provide.ts";

const props = defineProps<{
  language: Language;
}>();

const project = inject(projectKey);

const handleCheck = async () => {
  if (!project) return;

  await navigate(`/project/${project.id}/${props.language.id}`);
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
