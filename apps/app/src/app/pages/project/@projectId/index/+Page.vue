<script setup lang="ts">
import { inject } from "vue";
import type { Data } from "../+data.ts";
import ProjectLanguageList from "@/app/components/ProjectLanguageList.vue";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import ProjectReadme from "@/app/components/ProjectReadme.vue";

const project = inject(useInjectionKey<Data>("project"))!;
</script>

<template>
  <div class="mt-3 flex gap-2 items-start">
    <div class="flex flex-col gap-6 w-full items-start">
      <ProjectLanguageList :project />
      <ProjectReadme :project />
    </div>
    <ProjectDetailCard :project />
  </div>
</template>
