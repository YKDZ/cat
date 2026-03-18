<script setup lang="ts">
import { computed, inject } from "vue";

import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data } from "../+data.server.ts";

import DetailCard from "./DetailCard.vue";
import LanguageTable from "./LanguageTable.vue";
import Readme from "./Readme.vue";

const project = inject(useInjectionKey<Data>()("project"))!;
const targetLanguages = inject(useInjectionKey<Data>()("targetLanguages"))!;
const documents = inject(useInjectionKey<Data>()("documents"))!;


const readme = computed(() => {
  return documents.find((doc) => doc.name === "README.md") ?? null;
});
</script>

<template>
  <div
    class="mx-auto mt-3 grid w-full grid-cols-1 items-start gap-2 md:grid-cols-[2fr_1fr]"
  >
    <div class="flex w-full flex-col items-start gap-6">
      <LanguageTable :project :languages="targetLanguages" />
      <Readme v-if="readme" :readme />
    </div>
    <DetailCard :project />
  </div>
</template>
