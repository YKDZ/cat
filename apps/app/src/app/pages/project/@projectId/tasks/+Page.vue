<script setup lang="ts">
import { inject } from "vue";
import ProjectTaskListExportTranslatedFile from "@/app/components/ProjectTaskListExportTranslatedFile.vue";
import { projectKey } from "@/app/utils/provide.ts";

const project = inject(projectKey);
</script>

<template>
  <ProjectTaskListExportTranslatedFile
    v-if="project"
    :project-id="project.id"
  />
</template>
