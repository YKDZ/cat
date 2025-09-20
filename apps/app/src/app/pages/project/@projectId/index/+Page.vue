<script setup lang="ts">
import { inject } from "vue";
import type { Data } from "../+data.ts";
import ProjectLanguageList from "@/app/components/ProjectLanguageList.vue";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const project = inject(useInjectionKey<Data>("project"))!;
</script>

<template>
  <div class="mt-3 flex gap-6 w-full items-start">
    <ProjectLanguageList :project />
    <ProjectDetailCard :project />
  </div>
</template>
