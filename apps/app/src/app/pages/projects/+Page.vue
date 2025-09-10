<script setup lang="ts">
import ProjectList from "@/app/components/ProjectList.vue";
import { useProjectStore } from "@/app/stores/project.ts";
import { storeToRefs } from "pinia";

const { projects } = storeToRefs(useProjectStore());
</script>

<template>
  <ProjectList v-model="projects" />
</template>
