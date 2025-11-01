<script setup lang="ts">
import { computed, inject } from "vue";
import type { Data } from "../+data.server.ts";
import ProjectLanguageList from "@/app/components/ProjectLanguageList.vue";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import ProjectReadme from "@/app/components/ProjectReadme.vue";

const project = inject(useInjectionKey<Data>()("project"))!;
const targetLanguages = inject(useInjectionKey<Data>()("targetLanguages"))!;

const readme = computed(() => {
  return project!.Documents.filter((doc) => doc.name).find(
    (doc) => doc.name === "README.md",
  );
});
</script>

<template>
  <div class="mt-3 flex gap-2 items-start">
    <div class="flex flex-col gap-6 w-full items-start">
      <ProjectLanguageList :project :languages="targetLanguages" />
      <ProjectReadme v-if="readme" :readme />
    </div>
    <ProjectDetailCard :project />
  </div>
</template>
