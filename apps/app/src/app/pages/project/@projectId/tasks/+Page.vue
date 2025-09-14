<script setup lang="ts">
import ProjectTaskListExportTranslatedFile from "@/app/components/ProjectTaskListExportTranslatedFile.vue";
import type { Data } from "./+data.ts";
import { useData } from "vike-vue/useData";

const { project } = useData<Data>();
</script>

<template>
  <ProjectTaskListExportTranslatedFile
    v-if="project"
    :project-id="project.id"
  />
</template>
