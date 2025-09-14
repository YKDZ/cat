<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import ProjectTaskListExportTranslatedFile from "@/app/components/ProjectTaskListExportTranslatedFile.vue";

const { project } = useData<Data>();
</script>

<template>
  <ProjectTaskListExportTranslatedFile
    v-if="project"
    :project-id="project.id"
  />
</template>
