<script setup lang="ts">
import { computed, inject } from "vue";
import type { Data } from "../+data.server.ts";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import Readme from "@/app/pages/project/@projectId/index/Readme.vue";
import LanguageTable from "@/app/pages/project/@projectId/index/LanguageTable.vue";

const project = inject(useInjectionKey<Data>()("project"))!;
const targetLanguages = inject(useInjectionKey<Data>()("targetLanguages"))!;
const documents = inject(useInjectionKey<Data>()("documents"))!;

const readme = computed(() => {
  return documents.find((doc) => doc.name === "README.md") ?? null;
});
</script>

<template>
  <div
    class="mt-3 items-start w-full grid md:grid-cols-[2fr_1fr] grid-cols-1 gap-2 mx-auto"
  >
    <div class="flex flex-col gap-6 w-full items-start">
      <LanguageTable :project :languages="targetLanguages" />
      <Readme v-if="readme" :readme />
    </div>
    <ProjectDetailCard :project />
  </div>
</template>
