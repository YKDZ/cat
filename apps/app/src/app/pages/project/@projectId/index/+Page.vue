<script setup lang="ts">
import ProjectLanguageList from "@/app/components/ProjectLanguageList.vue";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
import type { Data } from "./+data.ts";
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import { projectKey } from "@/app/utils/provide.ts";

const { project } = useData<Data>();

provide(projectKey, project);
</script>

<template>
  <div class="mt-3 flex gap-6 w-full items-start">
    <ProjectLanguageList />
    <ProjectDetailCard />
  </div>
</template>
