<script setup lang="ts">
import ProjectTaskListExportTranslatedFile from "@/app/components/ProjectTaskListExportTranslatedFile.vue";
import { projectKey } from "@/app/utils/provide";
import { inject } from "vue";

const project = inject(projectKey);
</script>

<template>
  <ProjectTaskListExportTranslatedFile
    v-if="project"
    :project-id="project.id"
  />
</template>
