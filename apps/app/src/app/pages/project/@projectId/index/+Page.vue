<script setup lang="ts">
import { inject } from "vue";
import ProjectLanguageList from "@/app/components/ProjectLanguageList.vue";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
import { projectKey } from "@/app/utils/provide.ts";

const project = inject(projectKey)!;
</script>

<template>
  <div class="mt-3 flex gap-6 w-full items-start">
    <ProjectLanguageList :project />
    <ProjectDetailCard :project />
  </div>
</template>
